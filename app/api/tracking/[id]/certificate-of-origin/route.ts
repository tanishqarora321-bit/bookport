import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { getTrackingDocContext } from "@/lib/tracking-doc-context";
import { generateCertificateOfOriginPdf, COOTemplateConfig } from "@/lib/pdf/generateCertificateOfOrigin";
import { addDaysIso } from "@/lib/pdf/pdfHelpers";

// Same no-override-form design as fumigation-certificate - fix the
// source data on Booking & Instructions / Buyers & Customers, then
// generate. Seal/bales/gross weight come from the BL (via Upload BL's
// container_packing_items) if present, with a manual-entry fallback
// through those same screens if a container's BL data hasn't been
// filled in yet - this route itself has no separate manual-entry path.
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

  const { data: templateRow } = await supabase
    .from("document_templates")
    .select("template_config")
    .eq("company_id", me.company_id)
    .eq("doc_type", "certificate_of_origin")
    .eq("is_default", true)
    .single();
  if (!templateRow?.template_config) {
    return NextResponse.json({ error: "No Certificate of Origin template set up yet -- run migration 0034." }, { status: 400 });
  }

  const fieldData = {
    consignee_name: ctx.buyerParty.legal_name,
    consignee_address: ctx.gstEntry?.address || ctx.buyerParty.address || "",
    description_of_goods: ctx.gstEntry?.description_of_goods || ctx.booking.commodity || "",
    container_no: ctx.tracking.container_number,
    seal_no: ctx.packingItem?.seal_no || "",
    bales: ctx.packingItem?.bales != null ? String(ctx.packingItem.bales) : "",
    gross_weight: ctx.packingItem?.weight != null ? String(ctx.packingItem.weight) : "",
    weight_unit: ctx.packingItem?.weight_unit || "KGS",
    origin_country: "USA",
    date: addDaysIso(ctx.booking.bl_date, 3),
  };

  const pdfBytes = await generateCertificateOfOriginPdf(templateRow.template_config as COOTemplateConfig, fieldData);

  const { count } = await supabase
    .from("generated_documents")
    .select("id", { count: "exact", head: true })
    .eq("tracking_id", params.id)
    .eq("doc_type", "certificate_of_origin");
  const version = (count ?? 0) + 1;

  const filePath = `${me.company_id}/${params.id}/certificate_of_origin_v${version}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) return NextResponse.json({ error: `PDF generated but upload failed: ${uploadError.message}` }, { status: 500 });

  const { data: doc, error: insertError } = await supabase
    .from("generated_documents")
    .insert({ company_id: me.company_id, tracking_id: params.id, doc_type: "certificate_of_origin", field_data: fieldData, pdf_path: filePath, version })
    .select()
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Same auto-flip pattern as Send Instructions - a real generated
  // document is the strongest signal Shipment Tracking's "Docs Sent"
  // toggle should reflect.
  await supabase.from("tracking").update({ documents_sent: true }).eq("id", params.id);

  const { data: signedUrl } = await supabase.storage.from("documents").createSignedUrl(filePath, 60 * 60);

  return NextResponse.json({ document: doc, url: signedUrl?.signedUrl });
}
