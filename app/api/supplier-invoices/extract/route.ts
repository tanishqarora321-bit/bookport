import { NextRequest, NextResponse } from "next/server";
import { extractSupplierInvoiceFromPdf } from "@/lib/supplier-invoice-gemini";
import { getCurrentProfile } from "@/lib/supabase/session";

// Extraction only - never writes to supplier_invoices itself. The client
// shows this result in the same manual-entry "+ Add Invoice" form for
// review before saving it, exactly like the Forwarders PDF flow
// (app/api/forwarder-invoices/extract/route.ts).
//
// No company-scoped data is read or written here, but this still gated
// behind sign-in - otherwise anyone, authenticated or not, could spend
// this app's Gemini quota for free.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    const extracted = await extractSupplierInvoiceFromPdf(base64);
    return NextResponse.json({ extracted });
  } catch (err: any) {
    return NextResponse.json({ error: `Extraction failed: ${err.message}` }, { status: 502 });
  }
}
