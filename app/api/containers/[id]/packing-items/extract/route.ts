import { NextRequest, NextResponse } from "next/server";
import { extractPackingListFromPdf } from "@/lib/packing-list-gemini";

// Extraction only - never writes to container_packing_items itself. The
// client shows this result in the same "+ Add Line" form for review
// before saving, same pattern as every other PDF extraction in this app.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    const extracted = await extractPackingListFromPdf(base64);
    return NextResponse.json({ extracted });
  } catch (err: any) {
    return NextResponse.json({ error: `Extraction failed: ${err.message}` }, { status: 502 });
  }
}
