// Deleting a forwarder/supplier/trucker invoice shouldn't leave the
// Booking & Instructions picker still showing that party, as if they're
// still assigned, when their only invoice for this booking is gone.
// Only clears the assignment once NO invoice (across every container on
// the booking) still references that same party - a multi-container
// booking where only one container's invoice got deleted keeps its
// Forwarder/Supplier/Trucker Name, since the party is still genuinely
// assigned for the other container(s).
export async function unassignPartyIfNoInvoicesRemain(
  supabase: any,
  opts: {
    trackingId: string | null;
    partyId: string | null;
    role: "forwarder" | "supplier" | "trucker";
    invoiceTable: "forwarder_invoices" | "supplier_invoices" | "trucker_invoices";
    partyColumn: "forwarder_id" | "supplier_id" | "trucker_id";
  }
) {
  const { trackingId, partyId, role, invoiceTable, partyColumn } = opts;
  if (!trackingId || !partyId) return;

  const { data: tracking } = await supabase.from("tracking").select("booking_id").eq("id", trackingId).single();
  if (!tracking?.booking_id) return;

  const { data: bookingTracking } = await supabase.from("tracking").select("id").eq("booking_id", tracking.booking_id);
  const trackingIds = (bookingTracking ?? []).map((t: { id: string }) => t.id);
  if (trackingIds.length === 0) return;

  const { count } = await supabase
    .from(invoiceTable)
    .select("id", { count: "exact", head: true })
    .eq(partyColumn, partyId)
    .in("tracking_id", trackingIds);

  if ((count ?? 0) === 0) {
    await supabase.from("booking_parties").delete().eq("booking_id", tracking.booking_id).eq("role", role).eq("party_id", partyId);
  }
}
