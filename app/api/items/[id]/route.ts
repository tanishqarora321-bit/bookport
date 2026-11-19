import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const EDITABLE_COLUMNS = ["name", "is_active"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_COLUMNS.includes(key)) updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("items")
    .update(updates)
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}

// Permanently deletes an item (admin only, owner 2026-11-19). Shipments
// that used it (tracking.item_id - the Final Invoice's Item) lose the link
// first; their printed invoices are unchanged. "Remove" (is_active=false)
// stays the reversible way to hide one.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Only an admin can permanently delete an item" }, { status: 403 });

  const supabase = createServiceClient();
  const { data: item } = await supabase.from("items").select("id").eq("id", params.id).eq("company_id", me.company_id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error: unlinkError } = await supabase.from("tracking").update({ item_id: null }).eq("company_id", me.company_id).eq("item_id", params.id);
  if (unlinkError) return NextResponse.json({ error: unlinkError.message }, { status: 500 });
  const { error } = await supabase.from("items").delete().eq("id", params.id).eq("company_id", me.company_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
