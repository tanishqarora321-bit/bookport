import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { extractForwarderInvoiceFromPdf } from "@/lib/forwarder-invoice-gemini";

// Extraction only - never writes to forwarder_invoices itself. The invoice
// row already exists (auto-created from tracking); the client shows this
// result in the same manual-entry form for review before PATCHing it in,
// exactly like the "AI-filled, always correctable" Booking & Instructions
// PDF flow. No DB row is scoped here (nothing is read/written), but this
// still shouldn't be callable by a signed-out request - it burns a Gemini
// call per upload.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    const extracted = await extractForwarderInvoiceFromPdf(base64);
    return NextResponse.json({ extracted });
  } catch (err: any) {
    return NextResponse.json({ error: `Extraction failed: ${err.message}` }, { status: 502 });
  }
}
