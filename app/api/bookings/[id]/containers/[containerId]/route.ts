import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { removeForwarderInvoicePdfsForTracking } from "@/lib/forwarder-invoice-pdf";

const EDITABLE_COLUMNS = ["container_no", "seal_no", "size_type"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; containerId: string } }
) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .single();
  if (bookingError || !booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_COLUMNS.includes(key)) updates[key] = value === "" ? null : value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("containers")
    .update(updates)
    .eq("id", params.containerId)
    .eq("booking_id", params.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This container number is already on this booking." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ container: data });
}

// Deletes ONE container from a multi-container booking (e.g. to turn a
// "multiple" booking back into a single one) along with everything tied to
// that container alone: its tracking row and what points at it (the four
// party invoices, generated documents) and its tracking events. Packing
// details cascade with the container. The booking's last container can't
// be removed this way - that's deleting the booking itself.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; containerId: string } }
) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .single();
  if (bookingError || !booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: containers } = await supabase.from("containers").select("id, container_no").eq("booking_id", params.id);
  const target = (containers ?? []).find((c: { id: string }) => c.id === params.containerId);
  if (!target) return NextResponse.json({ error: "Container not found on this booking" }, { status: 404 });
  if ((containers ?? []).length <= 1) {
    return NextResponse.json({ error: "This is the booking's only container - delete the booking instead." }, { status: 400 });
  }

  if (target.container_no) {
    const { data: trackingRows } = await supabase
      .from("tracking")
      .select("id")
      .eq("booking_id", params.id)
      .eq("container_number", target.container_no);
    const trackingIds = (trackingRows ?? []).map((t: { id: string }) => t.id);
    if (trackingIds.length > 0) {
      // Uploaded forwarder invoice PDFs stored for this container go too.
      await removeForwarderInvoicePdfsForTracking(supabase, me.company_id, trackingIds);
      for (const table of ["generated_documents", "forwarder_invoices", "supplier_invoices", "trucker_invoices", "buyer_invoices"]) {
        const { error: childError } = await supabase.from(table).delete().in("tracking_id", trackingIds);
        if (childError) return NextResponse.json({ error: `Couldn't remove this container's ${table.replace(/_/g, " ")}: ${childError.message}` }, { status: 500 });
      }
      const { error: trackingError } = await supabase.from("tracking").delete().in("id", trackingIds);
      if (trackingError) return NextResponse.json({ error: `Couldn't remove this container's tracking: ${trackingError.message}` }, { status: 500 });
    }
  }

  const { error: eventsError } = await supabase.from("tracking_events").delete().eq("container_id", params.containerId);
  if (eventsError) return NextResponse.json({ error: `Couldn't remove this container's tracking events: ${eventsError.message}` }, { status: 500 });

  const { error } = await supabase
    .from("containers")
    .delete()
    .eq("id", params.containerId)
    .eq("booking_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
