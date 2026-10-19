import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { getTrackingDocContext } from "@/lib/tracking-doc-context";
import { generateFumigationCertificatePdf, FumigationTemplateConfig } from "@/lib/pdf/generateFumigationCertificate";
import { addDaysIso } from "@/lib/pdf/pdfHelpers";

// No override form by design (per Tanishq's own spec: "if the date and
// POL is not available... backtrack to Booking & Instructions and add
// them manually before generating") - this reads the BL date/container/
// POL that should already be correct on the booking, rather than asking
// the user to re-type them here. bl_date comes from the booking's own
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
  if (!ctx.booking?.pol) {
    return NextResponse.json(
      { error: "This booking has no Port of Loading set yet -- add it on Booking & Instructions first." },
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
    .eq("doc_type", "fumigation_certificate")
    .eq("is_default", true)
    .single();

  if (!templateRow?.template_config) {
    return NextResponse.json({ error: "No Fumigation Certificate template set up yet -- run migration 0034." }, { status: 400 });
  }

  const fieldData = {
    date: addDaysIso(ctx.booking.bl_date, 3),
    container_no: ctx.tracking.container_number,
    location: `${ctx.booking.pol} USA`,
  };

  const pdfBytes = await generateFumigationCertificatePdf(templateRow.template_config as FumigationTemplateConfig, fieldData);

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

  const { data: signedUrl } = await supabase.storage.from("documents").createSignedUrl(filePath, 60 * 60);

  return NextResponse.json({ document: doc, url: signedUrl?.signedUrl });
}
