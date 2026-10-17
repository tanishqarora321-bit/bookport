import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const DATE_FIELDS = ["etd", "eta", "cargo_cutoff", "si_cutoff", "vgm_cutoff"];

// Builds the "what this breaks" list before anything is saved.
// This one feature is what the brief calls the actual switching trigger.
async function computeImpact(supabase: any, bookingId: string, field: string, newValue: string) {
  const impact: string[] = [];

  if (field === "cargo_cutoff" || field === "etd") {
    const { data: trucking } = await supabase
      .from("trucking_jobs")
      .select("id, pickup_at, status")
      .eq("booking_id", bookingId);

    for (const job of trucking ?? []) {
      if (job.pickup_at && new Date(job.pickup_at) > new Date(newValue)) {
        impact.push(
          `Trucker pickup is booked for ${new Date(job.pickup_at).toLocaleDateString()}, which is now after the new cut-off.`
        );
      }
    }
  }

  if (field === "si_cutoff") {
    const { data: docs } = await supabase
      .from("documents")
      .select("doc_type, extraction_status")
      .eq("booking_id", bookingId)
      .eq("doc_type", "shipping_instructions");

    if (!docs || docs.length === 0) {
      const daysLeft = Math.ceil((new Date(newValue).getTime() - Date.now()) / (1000 * 3600 * 24));
      impact.push(`SI not yet submitted. New deadline is in ${daysLeft} day(s).`);
    }
  }

  return impact;
}

export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { booking_id, field, new_value, reason, notify_party_ids = [] } = await req.json();
  const supabase = createServiceClient();

  const { data: booking, error: fetchErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", booking_id)
    .eq("company_id", me.company_id)
    .single();
  if (fetchErr || !booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const impact = await computeImpact(supabase, booking_id, field, new_value);

  const changed_fields = { [field]: { old: booking[field], new: new_value } };

  // amendments has no reliable company_id of its own (added nullable in
  // migration 0003, never populated by this route historically) -- the
  // booking fetch above (scoped to me.company_id) is the real guard here,
  // same "walk up to the parent that has one" pattern as containers/
  // container_packing_items. Set it anyway now that we know it, for any
  // future code that might start trusting the column directly.
  const { error: amendErr } = await supabase.from("amendments").insert({
    booking_id,
    company_id: me.company_id,
    version: booking.version + 1,
    changed_fields,
    reason,
    notified_party_ids: notify_party_ids
  });
  if (amendErr) return NextResponse.json({ error: amendErr.message }, { status: 500 });

  const { error: updateErr } = await supabase
    .from("bookings")
    .update({ [field]: new_value, version: booking.version + 1, updated_at: new Date().toISOString() })
    .eq("id", booking_id)
    .eq("company_id", me.company_id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await supabase.from("audit_log").insert({
    entity: "bookings",
    entity_id: booking_id,
    field,
    old_value: String(booking[field] ?? ""),
    new_value: String(new_value),
    user_id: me.id
  });

  // Notification dispatch (email/SMS) is a P1 stub — queue here, send via
  // Resend/SES in the next phase. Returning the impact list either way so
  // the dialog can show it before or after confirming.
  return NextResponse.json({ impact, notified: notify_party_ids });
}
