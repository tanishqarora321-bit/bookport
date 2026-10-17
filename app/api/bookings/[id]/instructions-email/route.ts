import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { generateInstructionsEmail, InstructionsEmailData } from "@/lib/email/generateInstructionsEmail";
import { sendEmail } from "@/lib/send-email";

// Replaces the old PDF-based "Generate Instructions" - per Tanishq's real
// example, these go out as an EMAIL BODY to the forwarder, never a PDF
// attachment. `preview: true` renders without sending (for the compose
// modal to show before the user commits); omit it (or false) to actually
// send via the company's configured Resend account and log the result.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const supabase = createServiceClient();

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, carrier_booking_no, final_destination, commodity, hs_code, consignee_gst_entry_id, booking_parties (role, party_id, parties (legal_name, short_code))"
    )
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .single();

  if (bookingError || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const containerId: string | null = body.container_id ?? null;
  const [{ data: container }, { data: gstEntry }, { data: templateRow }] = await Promise.all([
    containerId
      ? supabase
          .from("containers")
          .select("container_no, seal_no, packing_items:container_packing_items (seal_no, weight, weight_unit, bales, sort_order)")
          .eq("id", containerId)
          .eq("booking_id", params.id)
          .single()
      : Promise.resolve({ data: null }),
    booking.consignee_gst_entry_id
      ? supabase
          .from("buyer_gst_entries")
          .select("legal_name, address, gst_no, iec_code, pan_no, mobile, email, description_of_goods, hs_code, transit_destination")
          .eq("id", booking.consignee_gst_entry_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("document_templates")
      .select("template_config")
      .eq("company_id", me.company_id)
      .eq("doc_type", "booking_instruction")
      .eq("is_default", true)
      .single(),
  ]);

  if (!templateRow?.template_config) {
    return NextResponse.json(
      { error: "No company letterhead set up yet -- add one in Settings before sending instructions." },
      { status: 400 }
    );
  }
  if (!gstEntry) {
    return NextResponse.json(
      { error: "This booking has no \"Consignee as per BL\" GST entry picked yet -- pick one first." },
      { status: 400 }
    );
  }

  const forwarderParty = (booking.booking_parties ?? []).find((bp: any) => bp.role === "forwarder")?.parties ?? null;
  const packingItems = ((container as any)?.packing_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order);
  const firstPacking = packingItems[0];
  const letterhead = templateRow.template_config as { company_name: string; address_lines: string[]; phone?: string; fax?: string; email?: string };

  const overrides = body.overrides ?? {};
  const emailData: InstructionsEmailData = {
    greeting_team: overrides.greeting_team || forwarderParty?.short_code || forwarderParty?.legal_name || "Team",
    booking_no: booking.carrier_booking_no || "",
    container_no: (container as any)?.container_no || "",
    seal_no: overrides.seal_no ?? (firstPacking?.seal_no || (container as any)?.seal_no || ""),
    weight: overrides.weight ?? (firstPacking?.weight != null ? String(firstPacking.weight) : ""),
    weight_unit: overrides.weight_unit ?? (firstPacking?.weight_unit || "LBS"),
    bales: overrides.bales ?? (firstPacking?.bales != null ? String(firstPacking.bales) : ""),
    shipper: letterhead,
    consignee: {
      legal_name: gstEntry.legal_name,
      address: gstEntry.address || "",
      gst_no: gstEntry.gst_no,
      iec_code: gstEntry.iec_code,
      pan_no: gstEntry.pan_no,
      mobile: gstEntry.mobile,
      email: gstEntry.email,
    },
    description_of_goods: overrides.description_of_goods ?? (gstEntry.description_of_goods || booking.commodity || ""),
    hs_code: overrides.hs_code ?? (gstEntry.hs_code || booking.hs_code || ""),
    value: overrides.value || "",
    transit_destination: overrides.transit_destination || gstEntry.transit_destination || booking.final_destination || "",
    sign_off_name: overrides.sign_off_name || "",
    sign_off_email: overrides.sign_off_email || "",
    sign_off_website: overrides.sign_off_website || "",
    sign_off_company: overrides.sign_off_company || letterhead.company_name,
  };

  // Sign-off identity defaults to the company's email settings (From
  // Name/Website) unless the compose modal overrode them for this send.
  if (!emailData.sign_off_email || !emailData.sign_off_website) {
    const { data: emailSettings } = await supabase
      .from("company_email_settings")
      .select("from_name, reply_to, website")
      .eq("company_id", me.company_id)
      .maybeSingle();
    emailData.sign_off_name = emailData.sign_off_name || emailSettings?.from_name || "";
    emailData.sign_off_email = emailData.sign_off_email || emailSettings?.reply_to || "";
    emailData.sign_off_website = emailData.sign_off_website || emailSettings?.website || "";
  }

  const { subject, html } = generateInstructionsEmail(emailData);

  if (body.preview) {
    // Not a hard default (forwarder ops inboxes are usually a shared
    // alias, not the buyer's own email) - just a convenience starting
    // point the compose modal can prefill and the user can change.
    return NextResponse.json({ subject, html, suggested_to: gstEntry.email || "" });
  }

  const to: string[] = Array.isArray(body.to) ? body.to.filter(Boolean) : [];
  if (to.length === 0) {
    return NextResponse.json({ error: "At least one \"To\" recipient is required." }, { status: 400 });
  }
  const cc: string[] = Array.isArray(body.cc) ? body.cc.filter(Boolean) : [];

  const result = await sendEmail(supabase, {
    companyId: me.company_id,
    to,
    cc,
    subject,
    html,
    bookingId: params.id,
    emailType: "booking_instruction",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, id: result.id, subject, html });
}
