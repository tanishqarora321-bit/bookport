import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import { generateFinalInvoicePdf, TemplateConfig, InvoiceFieldData } from "@/lib/pdf/generateFinalInvoice";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("generated_documents")
    .select("id, doc_type, field_data, pdf_path, version, created_at")
    .eq("tracking_id", params.id)
    .order("version", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
      .eq("company_id", DEFAULT_COMPANY_ID)
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

  // 2. Merge: auto-filled fields first, then anything the user explicitly
  // edited in the review screen (body.overrides) wins -- this is the
  // "editable field so if invoice generated incorrectly we can fix it" ask.
  const autoFilled: InvoiceFieldData = {
    invoice_no: tracking.invoice_no || "",
    invoice_date: body.overrides?.invoice_date || new Date().toISOString().slice(0, 10),
    consignee_name: party?.legal_name || "",
    consignee_address: party?.address || "",
    booking_number: tracking.booking_number || "",
    container_number: tracking.container_number || "",
    seal_number: tracking.seal_number || "",
    ship_via: tracking.shipping_line || "",
    terms: body.overrides?.terms || "Advance",
    reference_no: body.overrides?.reference_no || "",
    weight_lbs: body.overrides?.weight_lbs || "",
    qty_bales: body.overrides?.qty_bales || "",
    description: body.overrides?.description || item?.name || "",
    rate: body.overrides?.rate || "",
    amount: body.overrides?.amount || "",
    currency: body.overrides?.currency || "USD",
  };
  const finalData: InvoiceFieldData = { ...autoFilled, ...(body.overrides ?? {}) };

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

  const filePath = `${DEFAULT_COMPANY_ID}/${params.id}/final_invoice_v${version}.pdf`;
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
      company_id: DEFAULT_COMPANY_ID,
      tracking_id: params.id,
      doc_type: "final_invoice",
      field_data: finalData,
      pdf_path: filePath,
      version,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { data: signedUrl } = await supabase.storage.from("documents").createSignedUrl(filePath, 60 * 60);

  return NextResponse.json({ document: doc, url: signedUrl?.signedUrl });
}
