// Loads a company's document template, with fallbacks so a document never
// fails just because its template row was never seeded for that company.
// (Found live: migration 0034 seeded the Fumigation Certificate template
// only for the test company, so every real company got "No Fumigation
// Certificate template set up yet".)
//   fumigation_certificate - the third-party fumigator's own fixed letterhead
//                            (same for every company, see migration 0034).
//   certificate_of_origin  - the company's own letterhead (final_invoice)
//                            + the COO defaults from migration 0034.
//   set_of_documents       - the company's own letterhead (final_invoice);
//                            bank fields stay blank until set in Settings.
const FUMIGATOR_DEFAULT = {
  company_name: "INTERNATIONAL FUMIGATORS, INC.",
  address_lines: ["P.O BOX 263550", "HOUSTON, TAXAS"],
};
const COO_DEFAULTS = { trade_association: "US CHAMBER OF COMMERCE", place: "NEW YORK, USA" };

type DocType = "fumigation_certificate" | "certificate_of_origin" | "set_of_documents";

async function loadRow(supabase: any, companyId: string, docType: string) {
  const { data } = await supabase
    .from("document_templates")
    .select("template_config")
    .eq("company_id", companyId)
    .eq("doc_type", docType)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();
  return (data?.template_config as Record<string, any> | null) ?? null;
}

export async function loadDocTemplate(supabase: any, companyId: string, docType: DocType): Promise<Record<string, any> | null> {
  const own = await loadRow(supabase, companyId, docType);
  if (own) return own;
  if (docType === "fumigation_certificate") return FUMIGATOR_DEFAULT;
  const letterhead = await loadRow(supabase, companyId, "final_invoice");
  if (!letterhead) return null;
  return docType === "certificate_of_origin" ? { ...letterhead, ...COO_DEFAULTS } : letterhead;
}
