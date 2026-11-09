// Shared by the three booking grids - Booking & Instructions (/bookings),
// Closed Bookings (/bookings/closed) and Cancelled Bookings
// (/bookings/cancelled) - which all render the same BookingsClient over the
// same `bookings` query, split by stage (see fetchBookingsByStage below).
//
// A booking number with more than one container no longer has its own page:
// those rows stay in Booking & Instructions, flagged `is_multiple` so the
// grid can highlight them and filter to just them. Which rows count as
// "multiple" is computed live off current data, never a stored flag.
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

export type BookingStage = "open" | "closed" | "cancelled";

// bookings.status only allows draft/confirmed/in_transit/delivered/cancelled
// (migration 0001's check constraint). "Closed" is stored as `delivered` -
// a shipment that's done - and shown as "Closed" everywhere in the app (see
// STATUS_LABELS in components/ui/StatusPill.tsx), so no migration is needed.
export const CLOSED_STATUS = "delivered";
export const CANCELLED_STATUS = "cancelled";

// What "every field is filled in" means for auto-closing a booking: every
// Booking & Instructions column a person fills in, on EVERY container of the
// booking. Change this list to change when bookings close themselves.
export function isBookingComplete(rows: any[]): boolean {
  if (rows.length === 0) return false;
  const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
  return rows.every(
    (r) =>
      filled(r.carrier_booking_no) &&
      filled(r.erd) &&
      filled(r.si_cutoff) &&
      filled(r.cargo_cutoff) &&
      filled(r.pol) &&
      filled(r.pod) &&
      filled(r.final_destination) &&
      filled(r.bl_issued_at) &&
      filled(r.bl_number) &&
      filled(r.carrier) &&
      filled(r.container_size) &&
      filled(r.container_no) &&
      !!r.forwarder &&
      !!r.trucker &&
      !!r.supplier &&
      !!r.buyer &&
      (r.packing_items ?? []).length > 0 &&
      r.instruction_status === "sent"
  );
}

// Splits every booking into its stage:
// - cancelled: status "cancelled" (only ever set by hand);
// - closed: status "delivered" (moved by hand), OR every field filled in -
//   in which case its status is saved as closed here, so the Status column
//   and every other screen agree with the page it's on;
// - open: everything else -> Booking & Instructions.
// Each row also carries `is_multiple` (its booking number has more than one
// container) for Booking & Instructions' highlight + filter.
export async function fetchBookingsByStage(supabase: SupabaseClient, companyId: string) {
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(BOOKINGS_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) return { error, openRows: [], closedRows: [], cancelledRows: [], multipleGroupCount: 0 };

  const rowsByBooking = new Map<string, any[]>();
  const allRows: any[] = [];
  for (const b of (bookings ?? []) as any[]) {
    const rows = flattenBooking(b);
    rowsByBooking.set(b.id, rows);
    allRows.push(...rows);
  }

  // Same rule the old Multiple Bookings page used: a booking number that
  // shows up on more than one container row. Counted across every stage,
  // so a number reused by a cancelled booking still reads as multiple.
  const countByNumber = new Map<string, number>();
  for (const r of allRows) {
    const key = (r.carrier_booking_no ?? "").trim().toLowerCase();
    if (!key) continue;
    countByNumber.set(key, (countByNumber.get(key) ?? 0) + 1);
  }
  const isMultiple = (r: any) => {
    const key = (r.carrier_booking_no ?? "").trim().toLowerCase();
    return !!key && (countByNumber.get(key) ?? 0) > 1;
  };

  const toAutoClose: string[] = [];
  const openRows: any[] = [];
  const closedRows: any[] = [];
  const cancelledRows: any[] = [];
  for (const [bookingId, rows] of rowsByBooking) {
    const status = rows[0]?.status;
    let stage: BookingStage = "open";
    if (status === CANCELLED_STATUS) stage = "cancelled";
    else if (status === CLOSED_STATUS) stage = "closed";
    else if (isBookingComplete(rows)) {
      stage = "closed";
      toAutoClose.push(bookingId);
    }
    const target = stage === "open" ? openRows : stage === "closed" ? closedRows : cancelledRows;
    for (const r of rows) {
      target.push({ ...r, is_multiple: isMultiple(r), status: stage === "closed" ? CLOSED_STATUS : r.status });
    }
  }

  if (toAutoClose.length > 0) {
    await supabase.from("bookings").update({ status: CLOSED_STATUS }).in("id", toAutoClose).eq("company_id", companyId);
  }

  // Keep rows sharing a booking number next to each other (in the order the
  // first of them appears), so a multi-container number reads as one block.
  const groupTogether = (rows: any[]) => {
    const firstIndex = new Map<string, number>();
    rows.forEach((r, i) => {
      const key = (r.carrier_booking_no ?? "").trim().toLowerCase() || `__${r.booking_id}`;
      if (!firstIndex.has(key)) firstIndex.set(key, i);
    });
    return rows
      .map((r, i) => ({ r, i, g: firstIndex.get((r.carrier_booking_no ?? "").trim().toLowerCase() || `__${r.booking_id}`)! }))
      .sort((a, b) => a.g - b.g || a.i - b.i)
      .map((x) => x.r);
  };

  const multipleGroupCount = new Set(
    openRows.filter((r) => r.is_multiple).map((r) => (r.carrier_booking_no ?? "").trim().toLowerCase())
  ).size;

  return {
    error: null,
    openRows: groupTogether(openRows),
    closedRows: groupTogether(closedRows),
    cancelledRows: groupTogether(cancelledRows),
    multipleGroupCount,
  };
}
