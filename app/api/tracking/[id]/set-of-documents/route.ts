import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { getTrackingDocContext } from "@/lib/tracking-doc-context";
import { generateSetOfDocumentsPdf, SODTemplateConfig } from "@/lib/pdf/generateSetOfDocuments";
import { addDaysIso, weightInBothUnits } from "@/lib/pdf/pdfHelpers";

// Same no-override-form design as the other two generators - the
// Invoice Number must already exist on this tracking row (generate it
// via "Generate Invoice" first, same requirement that route already
// enforces), and the amount/currency come from the linked buyer_invoices
// row rather than being re-typed here.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();
  const ctx = await getTrackingDocContext(supabase, params.id, me.company_id);
  if (!ctx) return NextResponse.json({ error: "Tracking entry not found" }, { status: 404 });

  if (!ctx.buyerParty) {
    return NextResponse.json({ error: "This tracking entry has no Buyer (Consignee) assigned yet." }, { status: 400 });
  }
  if (!ctx.booking?.bl_date) {
    return NextResponse.json(
      { error: "This booking has no BL Issued Date yet -- upload the BL (or set it manually) on Booking & Instructions first." },
      { status: 400 }
    );
  }
  if (!ctx.tracking.container_number) {
    return NextResponse.json({ error: "This tracking entry has no Container Number yet." }, { status: 400 });
  }
  if (!ctx.tracking.invoice_no) {
    return NextResponse.json({ error: "Generate an invoice number on this row first (Generate Invoice)." }, { status: 400 });
  }

  const { data: buyerInvoice } = await supabase
    .from("buyer_invoices")
    .select("total, currency")
    .eq("tracking_id", params.id)
    .maybeSingle();

  const { data: templateRow } = await supabase
    .from("document_templates")
    .select("template_config")
    .eq("company_id", me.company_id)
    .eq("doc_type", "set_of_documents")
    .eq("is_default", true)
    .single();
  if (!templateRow?.template_config) {
    return NextResponse.json({ error: "No Set of Documents template set up yet -- run migration 0035." }, { status: 400 });
  }

  const { lbs, kgs } = weightInBothUnits(ctx.packingItem?.weight ?? null, ctx.packingItem?.weight_unit ?? null);

  const fieldData = {
    invoice_no: ctx.tracking.invoice_no,
    date: addDaysIso(ctx.booking.bl_date, 3),
    consignee_name: ctx.buyerParty.legal_name,
    consignee_address: ctx.gstEntry?.address || ctx.buyerParty.address || "",
    description_of_goods: ctx.gstEntry?.description_of_goods || ctx.booking.commodity || "",
    container_line: ctx.booking.container_size || "",
    container_no: ctx.tracking.container_number,
    bales: ctx.packingItem?.bales != null ? String(ctx.packingItem.bales) : "",
    weight_lbs: lbs,
    weight_kgs: kgs,
    amount: buyerInvoice?.total != null ? String(buyerInvoice.total) : "",
    currency: buyerInvoice?.currency || "USD",
  };

  const pdfBytes = await generateSetOfDocumentsPdf(templateRow.template_config as SODTemplateConfig, fieldData);

  const { count } = await supabase
    .from("generated_documents")
    .select("id", { count: "exact", head: true })
    .eq("tracking_id", params.id)
    .eq("doc_type", "set_of_documents");
  const version = (count ?? 0) + 1;

  const filePath = `${me.company_id}/${params.id}/set_of_documents_v${version}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) return NextResponse.json({ error: `PDF generated but upload failed: ${uploadError.message}` }, { status: 500 });

  const { data: doc, error: insertError } = await supabase
    .from("generated_documents")
    .insert({ company_id: me.company_id, tracking_id: params.id, doc_type: "set_of_documents", field_data: fieldData, pdf_path: filePath, version })
    .select()
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { data: signedUrl } = await supabase.storage.from("documents").createSignedUrl(filePath, 60 * 60);

  return NextResponse.json({ document: doc, url: signedUrl?.signedUrl });
}
