import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { saveInvoiceToLedger } from "@/lib/final-invoice-ledger";

// A generated document's version (Final Invoice page's Version history,
// owner 2026-11-19).
async function loadDoc(supabase: any, id: string, companyId: string) {
  const { data } = await supabase
    .from("generated_documents")
    .select("id, tracking_id, doc_type, field_data, pdf_path, version")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  return data;
}

// { locked: true } locks this version - the one Shipment Tracking shows and
// emails, and (for an invoice) its figures are written back to the Buyers
// ledger row. Only one version per container and document is locked; locking
// one unlocks the others. { locked: false } unlocks it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json();
  const supabase = createServiceClient();
  const doc = await loadDoc(supabase, params.id, me.company_id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const lock = !!body.locked;

  if (lock) {
    const { data: siblings } = await supabase
      .from("generated_documents")
      .select("id, field_data")
      .eq("tracking_id", doc.tracking_id)
      .eq("company_id", me.company_id)
      .eq("doc_type", doc.doc_type);
    for (const sib of siblings ?? []) {
      if (sib.id !== doc.id && sib.field_data?.locked) {
        const { locked: _l, ...rest } = sib.field_data;
        await supabase.from("generated_documents").update({ field_data: rest }).eq("id", sib.id);
      }
    }
  }
  const { locked: _old, ...rest } = doc.field_data ?? {};
  const field_data = lock ? { ...rest, locked: true } : rest;
  const { data, error } = await supabase.from("generated_documents").update({ field_data }).eq("id", doc.id).select("id, doc_type, field_data, pdf_path, version, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (lock && doc.doc_type === "final_invoice") {
    await saveInvoiceToLedger(supabase, me.company_id, doc.tracking_id, rest);
  }
  return NextResponse.json({ document: data });
}

// Deletes a version (its PDF too). A locked version can't be deleted.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createServiceClient();
  const doc = await loadDoc(supabase, params.id, me.company_id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (doc.field_data?.locked) return NextResponse.json({ error: "This version is locked - unlock it before deleting." }, { status: 409 });

  if (doc.pdf_path) await supabase.storage.from("documents").remove([doc.pdf_path]);
  const { error } = await supabase.from("generated_documents").delete().eq("id", doc.id).eq("company_id", me.company_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
