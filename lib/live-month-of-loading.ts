// Month of Loading on every party ledger (owner rule, 2026-11): Booking &
// Instructions is the master. An import fills a blank booking ERD from the
// sheet (lib/import-booking-fields.ts); after that the month shown on the
// Forwarders / Truckers / Suppliers / Buyers ledgers is read LIVE from the
// booking's ERD, so a change made in Booking & Instructions shows on every
// ledger (and files the invoice under the right Working Year). The invoice's
// own stored month is only the fallback for a booking with no ERD.
export async function applyLiveMonthOfLoading<T extends { tracking_id: string | null; month_of_loading: string | null }>(
  supabase: any,
  invoices: T[]
): Promise<T[]> {
  const trackingIds = Array.from(new Set(invoices.map((i) => i.tracking_id).filter((id): id is string => !!id)));
  if (trackingIds.length === 0) return invoices;
  const erdByTracking = new Map<string, string>();
  for (let i = 0; i < trackingIds.length; i += 200) {
    const chunk = trackingIds.slice(i, i + 200);
    const { data } = await supabase.from("tracking").select("id, booking:booking_id (erd)").in("id", chunk);
    for (const t of data ?? []) {
      const erd = Array.isArray(t.booking) ? t.booking[0]?.erd : t.booking?.erd;
      if (erd) erdByTracking.set(t.id, String(erd).slice(0, 10));
    }
  }
  return invoices.map((inv) => {
    const erd = inv.tracking_id ? erdByTracking.get(inv.tracking_id) : undefined;
    return erd ? { ...inv, month_of_loading: erd } : inv;
  });
}
