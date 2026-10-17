// Shared by every place that creates a booking (manual/PDF entry,
// bulk Excel import, and now the forwarder invoice import's
// create-a-missing-booking path) - reads the actual highest existing
// BP-YY-NNNN in use rather than counting rows, since counting breaks
// the moment any booking is ever deleted (see the fix history on this
// file's previous incarnations in app/api/bookings/route.ts and
// app/api/bookings/import/commit/route.ts for why).
//
// Scoped per company so two companies' booking numbers don't collide or
// leak volume information to each other via the shared BP-YY-NNNN
// sequence - each company gets its own 0001, 0002, ... per year.
export async function reserveBookingNos(supabase: any, count: number, companyId: string): Promise<string[]> {
  const year = new Date().getFullYear().toString().slice(-2);
  const { data } = await supabase
    .from("bookings")
    .select("booking_no")
    .eq("company_id", companyId)
    .like("booking_no", `BP-${year}-%`)
    .order("booking_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = data?.booking_no ? parseInt(data.booking_no.split("-")[2], 10) || 0 : 0;
  return Array.from({ length: count }, (_, i) => `BP-${year}-${String(start + i + 1).padStart(4, "0")}`);
}

export async function nextBookingNo(supabase: any, companyId: string): Promise<string> {
  return (await reserveBookingNos(supabase, 1, companyId))[0];
}
