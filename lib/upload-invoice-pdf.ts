// Client helper: stores the PDF an invoice was entered from, next to the
// container's Shipment Tracking documents (lib/party-invoice-pdf.ts).
export async function uploadInvoicePdf(kind: "forwarder" | "trucker" | "supplier", invoiceId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/${kind}-invoices/${invoiceId}/pdf`, { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Couldn't store the invoice PDF");
}
