import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { INVOICE_KIND_LABEL, INVOICE_PARTY_COLUMN, INVOICE_TABLE, listInvoicePdfs, parseInvoicePdfName, type InvoiceKind } from "@/lib/party-invoice-pdf";
import { generateFinalInvoicePdf, TemplateConfig, InvoiceFieldData } from "@/lib/pdf/generateFinalInvoice";
import { getTrackingDocContext } from "@/lib/tracking-doc-context";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();

  const { data: tracking, error: trackingError } = await supabase
    .from("tracking")
    .select("id")
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .single();
  if (trackingError || !tracking) {
    return NextResponse.json({ error: "Tracking entry not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("generated_documents")
    .select("id, doc_type, field_data, pdf_path, version, created_at")
    .eq("tracking_id", params.id)
    .order("version", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Forwarder / Trucker / Supplier invoice PDFs uploaded in those ledgers
  // for this container (lib/party-invoice-pdf.ts), with invoice number and
  // party. A file whose invoice no longer exists is never listed.
  const files = await listInvoicePdfs(supabase, me.company_id, params.id);
  const uploaded: { name: string; label: string; invoice_number: string | null; forwarder: string | null; uploaded_at: string | null }[] = [];
  const byKind = new Map<InvoiceKind, string[]>();
  for (const f of files) {
    const p = parseInvoicePdfName(f.name);
    if (p) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p.id]);
  }
  const invoiceInfo = new Map<string, { invoice_number: string | null; party: string | null }>();
  for (const [kind, ids] of byKind) {
    const { data: rows } = await supabase
      .from(INVOICE_TABLE[kind])
      .select(`id, invoice_number, party:${INVOICE_PARTY_COLUMN[kind]} (legal_name)`)
      .in("id", ids);
    for (const r of (rows ?? []) as any[]) invoiceInfo.set(`${kind}:${r.id}`, { invoice_number: r.invoice_number, party: r.party?.legal_name ?? null });
  }
  for (const f of files) {
    const p = parseInvoicePdfName(f.name)!;
    const info = invoiceInfo.get(`${p.kind}:${p.id}`);
    if (!info) continue;
    uploaded.push({ name: f.name, label: INVOICE_KIND_LABEL[p.kind], invoice_number: info.invoice_number, forwarder: info.party, uploaded_at: f.updated_at || f.created_at || null });
  }

  return NextResponse.json({ documents: data ?? [], uploaded });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  // 1. Pull tracking row + linked party/item -- this is what auto-fills
  // most fields per the spec (consignee = party, address = party's address,
  // booking/container/ship-via = already on the tracking row).
  const { data: tracking, error: trackingError } = await supabase
    .from("tracking")
    .select(
      "id, company_id, booking_number, container_number, shipping_line, seal_number, party_id, item_id, invoice_no"
    )
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .single();

  if (trackingError || !tracking) {
    return NextResponse.json({ error: "Tracking entry not found" }, { status: 404 });
  }

  const [{ data: party }, { data: item }, { data: templateRow }] = await Promise.all([
    tracking.party_id
      ? supabase.from("parties").select("legal_name, address, country").eq("id", tracking.party_id).single()
      : Promise.resolve({ data: null }),
    tracking.item_id ? supabase.from("items").select("name").eq("id", tracking.item_id).single() : Promise.resolve({ data: null }),
    supabase
      .from("document_templates")
      .select("template_config")
      .eq("company_id", me.company_id)
      .eq("doc_type", "final_invoice")
      .eq("is_default", true)
      .single(),
  ]);

  if (!templateRow?.template_config) {
    return NextResponse.json(
      { error: "No document template set up for this company yet -- run migration 0005 or add one in Settings." },
      { status: 400 }
    );
  }

  // 2. Defaults come from the data the app already has - the Buyers ledger
  // row (invoice no., date, weight, Cost section lines), the booking's
  // Supplier (printed under the charges, e.g. "GOODWILL Nashville"), the
  // container's packing (bales, seal, weight) and the buyer's shipping
  // details - so the invoice is complete from either "Generate Invoice" or
  // the Invoice page. Anything the user edited on the Invoice page
  // (body.overrides) wins, but a blank/null override never wipes a default
  // (that's how a missing invoice date used to print as 01/01/1970).
  const [ctx, { data: buyerInvoice }] = await Promise.all([
    getTrackingDocContext(supabase, params.id, me.company_id),
    supabase
      .from("buyer_invoices")
      .select("invoice_number, invoice_date, weight, weight_unit, total, currency, items:buyer_invoice_items (description, weight_kg, unit_price, amount, sort_order)")
      .eq("tracking_id", params.id)
      .maybeSingle(),
  ]);
  const packing = ctx?.packingItem ?? null;
  const { data: supplierRow } = ctx?.tracking.booking_id
    ? await supabase
        .from("booking_parties")
        .select("parties (legal_name)")
        .eq("booking_id", ctx.tracking.booking_id)
        .eq("role", "supplier")
        .limit(1)
        .maybeSingle()
    : { data: null };
  const supplierName = ((supplierRow as any)?.parties?.legal_name as string | undefined) ?? "";
  const items = ((buyerInvoice as any)?.items ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((it: any) => ({ description: it.description, weight_kg: it.weight_kg, unit_price: it.unit_price, amount: Number(it.amount) || 0 }));
  const useInvoiceWeight = buyerInvoice?.weight != null;
  const weight = useInvoiceWeight ? buyerInvoice!.weight : packing?.weight ?? null;
  const weightUnit = useInvoiceWeight ? buyerInvoice!.weight_unit : packing?.weight_unit;

  const autoFilled: InvoiceFieldData = {
    invoice_no: buyerInvoice?.invoice_number || tracking.invoice_no || "",
    invoice_date: buyerInvoice?.invoice_date || new Date().toISOString().slice(0, 10),
    consignee_name: party?.legal_name || "",
    consignee_address: ctx?.gstEntry?.address || party?.address || "",
    booking_number: tracking.booking_number || "",
    container_number: tracking.container_number || "",
    seal_number: tracking.seal_number || packing?.seal_no || "",
    ship_via: tracking.shipping_line || "",
    terms: "Advance",
    reference_no: "",
    weight_lbs: weight != null ? String(weight) : "",
    weight_unit: /^KG/i.test(weightUnit || "") ? "KG" : "LBS",
    qty_bales: packing?.bales != null ? String(packing.bales) : "",
    description: item?.name || "",
    goods_description: item?.name || ctx?.gstEntry?.description_of_goods || ctx?.booking?.commodity || "",
    supplier_name: supplierName,
    rate: "",
    amount: buyerInvoice?.total != null ? String(buyerInvoice.total) : "",
    currency: buyerInvoice?.currency || "USD",
    signed_by: me.full_name || me.email || "",
    items,
  };
  const overrides: Record<string, any> = {};
  for (const [k, val] of Object.entries(body.overrides ?? {})) {
    if (val == null || val === "") continue;
    if (Array.isArray(val) && val.length === 0) continue;
    overrides[k] = val;
  }
  const finalData: InvoiceFieldData = { ...autoFilled, ...overrides };

  if (!finalData.consignee_name) {
    return NextResponse.json({ error: "This tracking entry has no party assigned yet -- can't generate a consignee." }, { status: 400 });
  }
  if (!finalData.invoice_no) {
    return NextResponse.json({ error: "Generate an invoice number on this row first." }, { status: 400 });
  }

  // 3. Render the PDF.
  const pdfBytes = await generateFinalInvoicePdf(templateRow.template_config as TemplateConfig, finalData);

  // 4. Version = count of prior docs for this tracking row + 1. Old
  // versions are never overwritten or deleted -- see migration 0005 notes.
  const { count } = await supabase
    .from("generated_documents")
    .select("id", { count: "exact", head: true })
    .eq("tracking_id", params.id);
  const version = (count ?? 0) + 1;

  const filePath = `${me.company_id}/${params.id}/final_invoice_v${version}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `PDF generated but upload failed: ${uploadError.message}. Confirm a "documents" storage bucket exists (README setup step 3).` },
      { status: 500 }
    );
  }

  const { data: doc, error: insertError } = await supabase
    .from("generated_documents")
    .insert({
      company_id: me.company_id,
      tracking_id: params.id,
      doc_type: "final_invoice",
      field_data: finalData,
      pdf_path: filePath,
      version,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Generating a PDF no longer marks it "Sent" - Invoice Sent / Docs Sent
  // flip only when the PDF is actually emailed from Shipment Tracking's
  // Docs dialog (app/api/tracking/[id]/send-docs).

  const { data: signedUrl } = await supabase.storage.from("documents").createSignedUrl(filePath, 60 * 60);

  return NextResponse.json({ document: doc, url: signedUrl?.signedUrl });
}
