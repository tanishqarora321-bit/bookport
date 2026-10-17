import { NextRequest, NextResponse } from "next/server";
import { extractPackingListFromPdf } from "@/lib/packing-list-gemini";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// Extraction only - never writes to container_packing_items itself. The
// client shows this result in the same "+ Add Line" form for review
// before saving, same pattern as every other PDF extraction in this app.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();
  const { data: container, error: containerError } = await supabase
    .from("containers")
    .select("id, bookings!inner(company_id)")
    .eq("id", params.id)
    .single();
  if (containerError || !container || (container as any).bookings?.company_id !== me.company_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
