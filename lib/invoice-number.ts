// Buyer invoice numbers: YYYY-{buyer short code}/{seq}, e.g. "2026-LR/09" ->
// next "2026-LR/10". Year = year of issue; the sequence restarts per buyer
// per year, padded to 2 digits. Assigned only when the invoice's first PDF
// is actually generated (owner, 2026-11) - never just by opening the page.
export async function nextInvoiceNumber(supabase: any, companyId: string, partyId: string): Promise<{ invoice_no: string } | { error: string; status: number }> {
  const { data: party } = await supabase.from("parties").select("short_code, legal_name").eq("id", partyId).eq("company_id", companyId).maybeSingle();
  if (!party) return { error: "Buyer not found", status: 404 };
  if (!party.short_code) {
    return { error: `"${party.legal_name}" has no short code set yet — add one under Buyers / Customers before generating an invoice.`, status: 400 };
  }
  const prefix = `${new Date().getFullYear()}-${party.short_code}/`;
  // Numbers already used - on Shipment Tracking and on the Buyers ledger.
  const [{ data: onTracking, error }, { data: onLedger }] = await Promise.all([
    supabase.from("tracking").select("invoice_no").eq("company_id", companyId).eq("party_id", partyId).like("invoice_no", `${prefix}%`),
    supabase.from("buyer_invoices").select("invoice_number").eq("company_id", companyId).eq("buyer_id", partyId).like("invoice_number", `${prefix}%`),
  ]);
  if (error) return { error: error.message, status: 500 };
  let maxSeq = 0;
  for (const v of [...(onTracking ?? []).map((r: any) => r.invoice_no), ...(onLedger ?? []).map((r: any) => r.invoice_number)]) {
    const n = parseInt(String(v ?? "").slice(prefix.length), 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return { invoice_no: `${prefix}${String(maxSeq + 1).padStart(2, "0")}` };
}
