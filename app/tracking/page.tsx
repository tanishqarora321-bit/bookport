import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import TrackingClient from "@/components/TrackingClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TEMPORARY: service-role client, no login screen built yet - see README.
export default async function TrackingPage() {
  const supabase = createServiceClient();

  const [{ data: tracking, error: trackingError }, { data: bookings }, { data: parties }, { data: items }] =
    await Promise.all([
      supabase
        .from("tracking")
        .select(
          "id, booking_id, party_id, item_id, consignee_as_per_bl, invoice_no, booking_number, container_number, eta, forwarder_name, release_status, shipping_line, invoice_sent, documents_sent, remarks, bl_number, bl_status, ocean_freight, ocean_freight_currency, last_tracking_check_at"
        )
        .eq("company_id", DEFAULT_COMPANY_ID)
        .order("created_at", { ascending: false }),
      // Bookings not yet linked to a tracking row - these are what's
      // available to assign in the "+ Assign Booking" flow.
      supabase
        .from("bookings")
        .select("id, booking_no, carrier_booking_no, carrier, forwarder_name")
        .eq("company_id", DEFAULT_COMPANY_ID)
        .order("created_at", { ascending: false }),
      supabase
        .from("parties")
        .select("id, legal_name, short_code")
        .eq("company_id", DEFAULT_COMPANY_ID)
        .eq("is_active", true)
        .order("legal_name"),
      supabase
        .from("items")
        .select("id, name")
        .eq("company_id", DEFAULT_COMPANY_ID)
        .eq("is_active", true)
        .order("name"),
    ]);

  if (trackingError) return <p className="text-red-600 p-6">{trackingError.message}</p>;

  const assignedBookingIds = new Set((tracking ?? []).map((t: { booking_id: string | null }) => t.booking_id).filter(Boolean));
  const unassignedBookings = (bookings ?? []).filter((b: { id: string }) => !assignedBookingIds.has(b.id));

  return (
    <TrackingClient
      initialTracking={tracking ?? []}
      unassignedBookings={unassignedBookings}
      parties={parties ?? []}
      items={items ?? []}
    />
  );
}
