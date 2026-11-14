import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { FORWARDER_INVOICE_PDF_RE } from "@/lib/forwarder-invoice-pdf";

// A short-lived link to one uploaded invoice PDF stored for this tracking
// row (Shipment Tracking -> Docs -> View PDF).
export async function GET(_req: NextRequest, { params }: { params: { id: string; name: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!FORWARDER_INVOICE_PDF_RE.test(params.name)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = createServiceClient();
  const { data: tracking } = await supabase.from("tracking").select("id").eq("id", params.id).eq("company_id", me.company_id).maybeSingle();
  if (!tracking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase.storage.from("documents").createSignedUrl(`${me.company_id}/${params.id}/${params.name}`, 60 * 60);
  if (error || !data) return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });
  return NextResponse.json({ url: data.signedUrl });
}
