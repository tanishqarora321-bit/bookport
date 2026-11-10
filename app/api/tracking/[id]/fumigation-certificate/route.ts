import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { loadDocTemplate } from "@/lib/doc-templates";
import { getTrackingDocContext } from "@/lib/tracking-doc-context";
import { generateFumigationCertificatePdf, FumigationTemplateConfig } from "@/lib/pdf/generateFumigationCertificate";
import { addDaysIso } from "@/lib/pdf/pdfHelpers";

// No override form by design: the certificate is the owner's real
// International Fumigators certificate with only TWO values changed - the
// container number and the date (lib/pdf/generateFumigationCertificate.ts).
// Both are read from the booking rather than re-typed here. bl_date comes from the booking's own
// uploaded BL (Upload BL on Booking & Instructions, migration 0033) -
// the fumigation date is always 3 days after it.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();
  const ctx = await getTrackingDocContext(supabase, params.id, me.company_id);
  if (!ctx) return NextResponse.json({ error: "Tracking entry not found" }, { status: 404 });

  if (!ctx.booking?.bl_date) {
    return NextResponse.json(
      { error: "This booking has no BL Issued Date yet -- upload the BL (or set it manually) on Booking & Instructions first." },
      { status: 400 }
    );
  }
  if (!ctx.tracking.container_number) {
    return NextResponse.json({ error: "This tracking entry has no Container Number yet." }, { status: 400 });
  }

  const templateConfig = await loadDocTemplate(supabase, me.company_id, "fumigation_certificate");

  if (!templateConfig) {
    return NextResponse.json({ error: "No Fumigation Certificate template could be loaded." }, { status: 400 });
  }

  const fieldData = {
    date: addDaysIso(ctx.booking.bl_date, 3),
    container_no: ctx.tracking.container_number,
  };

  const pdfBytes = await generateFumigationCertificatePdf(templateConfig as FumigationTemplateConfig, fieldData);

  const { count } = await supabase
    .from("generated_documents")
    .select("id", { count: "exact", head: true })
    .eq("tracking_id", params.id)
    .eq("doc_type", "fumigation_certificate");
  const version = (count ?? 0) + 1;

  const filePath = `${me.company_id}/${params.id}/fumigation_certificate_v${version}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) return NextResponse.json({ error: `PDF generated but upload failed: ${uploadError.message}` }, { status: 500 });

  const { data: doc, error: insertError } = await supabase
    .from("generated_documents")
    .insert({ company_id: me.company_id, tracking_id: params.id, doc_type: "fumigation_certificate", field_data: fieldData, pdf_path: filePath, version })
    .select()
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Generating a PDF no longer marks it "Sent" - Invoice Sent / Docs Sent
  // flip only when the PDF is actually emailed from Shipment Tracking's
  // Docs dialog (app/api/tracking/[id]/send-docs).

  const { data: signedUrl } = await supabase.storage.from("documents").createSignedUrl(filePath, 60 * 60);

  return NextResponse.json({ document: doc, url: signedUrl?.signedUrl });
}
