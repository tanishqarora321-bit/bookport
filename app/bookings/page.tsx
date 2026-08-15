import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import BookingsClient from "@/components/BookingsClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TEMPORARY: service-role client, no login screen built yet - see README.
export default async function BookingsPage() {
  const supabase = createServiceClient();

  const [{ data: bookings, error }, { data: forwarders }, { data: truckers }, { data: suppliers }, { data: buyers }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, carrier_booking_no, erd, si_cutoff, cargo_cutoff, pol, pod, final_destination, bl_issued_at, carrier, vessel, status, " +
            "containers (id, container_no, seal_no, size_type), " +
            "booking_parties (role, party_id, parties (legal_name)), " +
            "consignee_items:booking_consignee_items (id, description, sort_order)"
        )
        .eq("company_id", DEFAULT_COMPANY_ID)
        .order("created_at", { ascending: false }),
      // Forwarders/Truckers/Suppliers/Buyers are all `parties` rows,
      // filtered by role -- same table, same reasoning as every other
      // module that reuses it.
      supabase.from("parties").select("id, legal_name").eq("company_id", DEFAULT_COMPANY_ID).eq("is_active", true).contains("roles", ["forwarder"]).order("legal_name"),
      supabase.from("parties").select("id, legal_name").eq("company_id", DEFAULT_COMPANY_ID).eq("is_active", true).contains("roles", ["trucker"]).order("legal_name"),
      supabase.from("parties").select("id, legal_name").eq("company_id", DEFAULT_COMPANY_ID).eq("is_active", true).contains("roles", ["supplier"]).order("legal_name"),
      supabase.from("parties").select("id, legal_name").eq("company_id", DEFAULT_COMPANY_ID).eq("is_active", true).contains("roles", ["buyer"]).order("legal_name"),
    ]);

  if (error) return <p className="text-red-600 p-6">{error.message}</p>;

  // Flatten: one row per (booking, container). A booking with zero
  // containers still shows once, with container fields null -- see
  // migration 0011's note on why "same booking number + null container"
  // is a valid, expected state (a container slot whose number isn't known
  // yet), not a bug.
  type BookingRow = any;
  const flattened: BookingRow[] = [];
  for (const b of (bookings ?? []) as any[]) {
    const containers = b.containers?.length ? b.containers : [{ id: null, container_no: null, seal_no: null, size_type: null }];
    const partyByRole: Record<string, { id: string; name: string }> = {};
    for (const bp of b.booking_parties ?? []) {
      if (bp.parties) partyByRole[bp.role] = { id: bp.party_id, name: bp.parties.legal_name };
    }
    for (const c of containers) {
      flattened.push({
        booking_id: b.id,
        container_id: c.id,
        carrier_booking_no: b.carrier_booking_no,
        erd: b.erd,
        si_cutoff: b.si_cutoff,
        cargo_cutoff: b.cargo_cutoff,
        pol: b.pol,
        pod: b.pod,
        final_destination: b.final_destination,
        bl_issued_at: b.bl_issued_at,
        carrier: b.carrier,
        vessel: b.vessel,
        status: b.status,
        container_no: c.container_no,
        forwarder: partyByRole["forwarder"] ?? null,
        trucker: partyByRole["trucker"] ?? null,
        supplier: partyByRole["supplier"] ?? null,
        buyer: partyByRole["buyer"] ?? null,
        consignee_items: (b.consignee_items ?? []).sort((x: any, y: any) => x.sort_order - y.sort_order),
      });
    }
  }

  return (
    <BookingsClient
      rows={flattened}
      forwarders={forwarders ?? []}
      truckers={truckers ?? []}
      suppliers={suppliers ?? []}
      buyers={buyers ?? []}
    />
  );
}
