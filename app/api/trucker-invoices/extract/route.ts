import { NextRequest, NextResponse } from "next/server";
import { extractTruckerInvoiceFromPdf } from "@/lib/trucker-invoice-gemini";

// Extraction only - never writes to trucker_invoices itself. The invoice
// row already exists (auto-created from tracking); the client shows this
// result in the same manual-entry form for review before PATCHing it in,
// exactly like the Forwarders invoice PDF flow.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    const extracted = await extractTruckerInvoiceFromPdf(base64);
    return NextResponse.json({ extracted });
  } catch (err: any) {
    return NextResponse.json({ error: `Extraction failed: ${err.message}` }, { status: 502 });
  }
}
