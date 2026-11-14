// A forwarder invoice that was entered by uploading its PDF (Enter Invoice
// -> Upload PDF in the Forwarder ledger) keeps that PDF: it's stored in the
// same "documents" bucket folder as the container's other Shipment Tracking
// documents - {company}/{tracking}/forwarder-invoice-{invoiceId}.pdf - and
// listed in Shipment Tracking's Docs dialog. Invoices entered by hand or by
// Excel import have no physical invoice, so nothing is stored for them.
//
// The PDF lives exactly as long as the invoice: deleting the invoice,
// clearing the forwarder on the booking, or removing the container /
// booking deletes it too (same rule as the invoices themselves).
const BUCKET = "documents";
export const FORWARDER_INVOICE_PDF_RE = /^forwarder-invoice-[0-9a-f-]{36}\.pdf$/;

export function forwarderInvoicePdfPath(companyId: string, trackingId: string, invoiceId: string) {
  return `${companyId}/${trackingId}/forwarder-invoice-${invoiceId}.pdf`;
}

export function invoiceIdFromPdfName(name: string): string | null {
  return FORWARDER_INVOICE_PDF_RE.test(name) ? name.slice("forwarder-invoice-".length, -".pdf".length) : null;
}

// Removes the stored PDFs of these invoices (missing files are ignored).
export async function removeForwarderInvoicePdfs(
  supabase: any,
  companyId: string,
  invoices: { id: string; tracking_id: string | null }[]
) {
  const paths = invoices.filter((i) => i.tracking_id).map((i) => forwarderInvoicePdfPath(companyId, i.tracking_id!, i.id));
  if (paths.length === 0) return;
  await supabase.storage.from(BUCKET).remove(paths);
}

// Lists the forwarder invoice PDFs stored for one container's tracking row.
export async function listForwarderInvoicePdfs(supabase: any, companyId: string, trackingId: string) {
  const { data } = await supabase.storage.from(BUCKET).list(`${companyId}/${trackingId}`, { limit: 100 });
  return ((data ?? []) as { name: string; created_at?: string; updated_at?: string }[]).filter((f) => FORWARDER_INVOICE_PDF_RE.test(f.name));
}

// Removes every forwarder invoice PDF stored for these tracking rows (used
// when the container or the whole booking is deleted).
export async function removeForwarderInvoicePdfsForTracking(supabase: any, companyId: string, trackingIds: string[]) {
  const paths: string[] = [];
  for (const t of trackingIds) {
    for (const f of await listForwarderInvoicePdfs(supabase, companyId, t)) paths.push(`${companyId}/${t}/${f.name}`);
  }
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
}
