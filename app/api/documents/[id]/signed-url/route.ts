import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  const { data: doc, error } = await supabase.from("generated_documents").select("pdf_path").eq("id", params.id).single();
  if (error || !doc?.pdf_path) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage.from("documents").createSignedUrl(doc.pdf_path, 60 * 60);
  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

  return NextResponse.json({ url: signed.signedUrl });
}
