// Shared by the Fumigation Certificate / Certificate of Origin / Set of
// Documents generation routes (app/api/tracking/[id]/*-certificate* and
// similar) - all three need the same chain: tracking row -> its linked
// booking (for bl_date/pol/commodity/hs_code) -> its container (matched
// by tracking.container_number, for seal/weight/bales) -> its buyer
// party + that buyer's one shipping-details record (migration 0032).
// One place to get this join right instead of three slightly different
// copies drifting apart.
export type TrackingDocContext = {
  tracking: { id: string; booking_id: string | null; container_number: string | null; party_id: string | null; invoice_no: string | null };
  booking: { bl_date: string | null; pol: string | null; pod: string | null; commodity: string | null; hs_code: string | null; container_size: string | null } | null;
  buyerParty: { legal_name: string; address: string | null } | null;
  gstEntry: { address: string | null; description_of_goods: string | null; hs_code: string | null } | null;
  packingItem: { seal_no: string | null; weight: number | null; weight_unit: string | null; bales: number | null } | null;
};

export async function getTrackingDocContext(supabase: any, trackingId: string, companyId: string): Promise<TrackingDocContext | null> {
  const { data: tracking } = await supabase
    .from("tracking")
    .select("id, booking_id, container_number, party_id, invoice_no")
    .eq("id", trackingId)
    .eq("company_id", companyId)
    .single();
  if (!tracking) return null;

  const [{ data: booking }, { data: buyerParty }] = await Promise.all([
    tracking.booking_id
      ? supabase.from("bookings").select("bl_date, pol, pod, commodity, hs_code, container_size").eq("id", tracking.booking_id).maybeSingle()
      : Promise.resolve({ data: null }),
    tracking.party_id
      ? supabase.from("parties").select("legal_name, address").eq("id", tracking.party_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { data: gstEntry } = tracking.party_id
    ? await supabase
        .from("buyer_gst_entries")
        .select("address, description_of_goods, hs_code")
        .eq("buyer_party_id", tracking.party_id)
        .maybeSingle()
    : { data: null };

  let packingItem = null;
  if (tracking.booking_id && tracking.container_number) {
    const { data: container } = await supabase
      .from("containers")
      .select("id")
      .eq("booking_id", tracking.booking_id)
      .ilike("container_no", tracking.container_number)
      .maybeSingle();
    if (container) {
      const { data: item } = await supabase
        .from("container_packing_items")
        .select("seal_no, weight, weight_unit, bales")
        .eq("container_id", container.id)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      packingItem = item ?? null;
    }
  }

  return { tracking, booking: booking ?? null, buyerParty: buyerParty ?? null, gstEntry: gstEntry ?? null, packingItem };
}
