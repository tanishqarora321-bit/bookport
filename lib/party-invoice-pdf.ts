// A Forwarder / Trucker / Supplier invoice that was entered by uploading its
// PDF (Enter Invoice / Add Invoice -> upload PDF in that party's ledger)
// keeps that PDF: it's stored in the same "documents" bucket folder as the
// container's other Shipment Tracking documents -
// {company}/{tracking}/{kind}-invoice-{invoiceId}.pdf - and listed in
// Shipment Tracking's Docs dialog (view only; never emailed to the buyer).
// Invoices entered by hand or by Excel import have no physical invoice, so
// nothing is stored for them.
//
// The PDF lives exactly as long as the invoice: deleting the invoice,
// clearing that party on the booking, or removing the container / booking
// deletes it too (same rule as the invoices themselves).
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const BUCKET = "documents";
export type InvoiceKind = "forwarder" | "trucker" | "supplier";
export const INVOICE_TABLE: Record<InvoiceKind, string> = {
  forwarder: "forwarder_invoices",
  trucker: "trucker_invoices",
  supplier: "supplier_invoices",
};
export const INVOICE_PARTY_COLUMN: Record<InvoiceKind, string> = {
  forwarder: "forwarder_id",
  trucker: "trucker_id",
  supplier: "supplier_id",
};
export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  forwarder: "Forwarder Invoice",
  trucker: "Trucker Invoice",
  supplier: "Supplier Invoice",
};
export const INVOICE_PDF_RE = /^(forwarder|trucker|supplier)-invoice-([0-9a-f-]{36})\.pdf$/;

export function invoicePdfPath(kind: InvoiceKind, companyId: string, trackingId: string, invoiceId: string) {
  return `${companyId}/${trackingId}/${kind}-invoice-${invoiceId}.pdf`;
}

export function parseInvoicePdfName(name: string): { kind: InvoiceKind; id: string } | null {
  const m = name.match(INVOICE_PDF_RE);
  return m ? { kind: m[1] as InvoiceKind, id: m[2] } : null;
}

// Removes the stored PDFs of these invoices (missing files are ignored).
export async function removeInvoicePdfs(supabase: any, companyId: string, kind: InvoiceKind, invoices: { id: string; tracking_id: string | null }[]) {
  const paths = invoices.filter((i) => i.tracking_id).map((i) => invoicePdfPath(kind, companyId, i.tracking_id!, i.id));
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
}

// The uploaded invoice PDFs stored for one container's tracking row.
export async function listInvoicePdfs(supabase: any, companyId: string, trackingId: string) {
  const { data } = await supabase.storage.from(BUCKET).list(`${companyId}/${trackingId}`, { limit: 100 });
  return ((data ?? []) as { name: string; created_at?: string; updated_at?: string }[]).filter((f) => INVOICE_PDF_RE.test(f.name));
}

// Removes every uploaded invoice PDF stored for these tracking rows (used
// when the container or the whole booking is deleted).
export async function removeInvoicePdfsForTracking(supabase: any, companyId: string, trackingIds: string[]) {
  const paths: string[] = [];
  for (const t of trackingIds) {
    for (const f of await listInvoicePdfs(supabase, companyId, t)) paths.push(`${companyId}/${t}/${f.name}`);
  }
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
}

// POST handler shared by /api/{forwarder,trucker,supplier}-invoices/[id]/pdf:
// stores the PDF the invoice was entered from (re-uploading replaces it).
export async function handleInvoicePdfUpload(req: NextRequest, kind: InvoiceKind, invoiceId: string) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();
  const { data: invoice } = await supabase
    .from(INVOICE_TABLE[kind])
    .select("id, tracking_id")
    .eq("id", invoiceId)
    .eq("company_id", me.company_id)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!invoice.tracking_id) {
    return NextResponse.json({ error: "This invoice isn't linked to a container in Shipment Tracking, so its PDF can't be filed there." }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "Only PDF invoices can be stored." }, { status: 400 });
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(invoicePdfPath(kind, me.company_id, invoice.tracking_id, invoice.id), bytes, { contentType: "application/pdf", upsert: true });
  if (error) return NextResponse.json({ error: `Couldn't store the invoice PDF: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
