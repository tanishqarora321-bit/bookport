import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { forwarderInvoicePdfPath } from "@/lib/forwarder-invoice-pdf";

// Stores the PDF a forwarder invoice was entered from (Enter Invoice ->
// Upload PDF) next to the container's Shipment Tracking documents
// (lib/forwarder-invoice-pdf.ts). Re-uploading replaces it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();
  const { data: invoice } = await supabase
    .from("forwarder_invoices")
    .select("id, tracking_id")
    .eq("id", params.id)
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
    .from("documents")
    .upload(forwarderInvoicePdfPath(me.company_id, invoice.tracking_id, invoice.id), bytes, { contentType: "application/pdf", upsert: true });
  if (error) return NextResponse.json({ error: `Couldn't store the invoice PDF: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
