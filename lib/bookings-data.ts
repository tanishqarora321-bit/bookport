// Shared between app/bookings/page.tsx and app/bookings/multiple/page.tsx -
// both render the same grid (BookingsClient) over the same underlying
// `bookings` query, split by whether a carrier_booking_no is unique for
// this company right now. A booking number that comes back to being
// unique (the user deletes every other entry sharing it) moves itself
// back to the main page automatically next load, purely because this
// grouping is computed live off current data, not a stored flag that
// something has to remember to update (see migration 0031).
import { SupabaseClient } from "@supabase/supabase-js";

const BOOKINGS_SELECT =
  "id, carrier_booking_no, erd, si_cutoff, cargo_cutoff, pol, pod, final_destination, bl_issued_at, bl_number, bl_date, carrier, vessel, container_size, status, instruction_status, created_at, " +
  "containers (id, container_no, seal_no, size_type, packing_items:container_packing_items (id, seal_no, weight, weight_unit, bales, description, sort_order)), " +
  "booking_parties (role, party_id, parties (legal_name))";

// Flattens one booking (with its nested containers/parties/etc.) into one
// row per container, matching what BookingsClient expects. A booking with
// zero containers still shows once, with container fields null - see
// migration 0011's note on why "same booking number + null container" is
// a valid, expected state (a container slot whose number isn't known
// yet), not a bug.
function flattenBooking(b: any): any[] {
  const containers = b.containers?.length
    ? b.containers
    : [{ id: null, container_no: null, seal_no: null, size_type: null, packing_items: [] }];
  const partyByRole: Record<string, { id: string; name: string }> = {};
  for (const bp of b.booking_parties ?? []) {
    if (bp.parties) partyByRole[bp.role] = { id: bp.party_id, name: bp.parties.legal_name };
  }
  return containers.map((c: any) => ({
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
    bl_number: b.bl_number,
    carrier: b.carrier,
    vessel: b.vessel,
    container_size: b.container_size,
    status: b.status,
    instruction_status: b.instruction_status,
    container_no: c.container_no,
    forwarder: partyByRole["forwarder"] ?? null,
    trucker: partyByRole["trucker"] ?? null,
    supplier: partyByRole["supplier"] ?? null,
    buyer: partyByRole["buyer"] ?? null,
    packing_items: (c.packing_items ?? []).sort((x: any, y: any) => x.sort_order - y.sort_order),
  }));
}

export async function fetchBookingsSplitByDuplicates(supabase: SupabaseClient, companyId: string) {
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(BOOKINGS_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) return { error, singleRows: [], duplicateRows: [], duplicateGroupCount: 0 };

  // Only a non-blank carrier_booking_no can make a booking "a duplicate" -
  // several bookings with no number yet are each their own normal entry,
  // not a conflict to resolve.
  const countByNumber = new Map<string, number>();
  for (const b of (bookings ?? []) as any[]) {
    const key = (b.carrier_booking_no ?? "").trim().toLowerCase();
    if (!key) continue;
    countByNumber.set(key, (countByNumber.get(key) ?? 0) + 1);
  }

  const singleBookings: any[] = [];
  const duplicateBookings: any[] = [];
  for (const b of (bookings ?? []) as any[]) {
    const key = (b.carrier_booking_no ?? "").trim().toLowerCase();
    if (key && (countByNumber.get(key) ?? 0) > 1) duplicateBookings.push(b);
    else singleBookings.push(b);
  }

  // Sort duplicates so every booking sharing a number lands next to each
  // other, instead of the default most-recent-first ordering scattering them.
  duplicateBookings.sort((a, b) => {
    const ka = (a.carrier_booking_no ?? "").trim().toLowerCase();
    const kb = (b.carrier_booking_no ?? "").trim().toLowerCase();
    if (ka !== kb) return ka < kb ? -1 : 1;
    return (a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1;
  });

  return {
    error: null,
    singleRows: singleBookings.flatMap(flattenBooking),
    duplicateRows: duplicateBookings.flatMap(flattenBooking),
    duplicateGroupCount: Array.from(countByNumber.values()).filter((n) => n > 1).length,
  };
}
