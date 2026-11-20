import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { cleanAddOn } from "@/lib/rate-sheet-addon";

// NOTE: this file previously exported a POST handler that was an exact
// duplicate of app/api/rate-sheets/[id]/entries/route.ts's "add one
// entry" logic (the same copy/paste mistake described in
// app/api/rate-sheets/route.ts). It was dead code - nothing in the app
// ever called POST /api/rate-sheets/[id] - and this route also had no
// DELETE handler at all, even though SheetManageCard in
// FreightComparisonClient.tsx calls DELETE /api/rate-sheets/${sheet.id}
// to remove an entire uploaded sheet, meaning that button has never
// worked. Removed the dead POST and added the DELETE it was actually
// missing, both as part of restoring real functionality and adding the
// company scoping this security pass is for.

// Entries cascade-delete with the sheet (on delete cascade, migration 0008).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("rate_sheets")
    .delete()
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// Edits a sheet's forwarder name and its per-container add-on (owner,
// 2026-11 - Freight Comparison's "Manage uploaded rate sheets").
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json();
  const updates: Record<string, any> = cleanAddOn(body);
  if (typeof body.forwarder_name === "string" && body.forwarder_name.trim()) updates.forwarder_name = body.forwarder_name.trim();
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  updates.updated_at = new Date().toISOString();
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("rate_sheets").update(updates).eq("id", params.id).eq("company_id", me.company_id).select().maybeSingle();
  if (error) return NextResponse.json({ error: /add_on|charges_note/i.test(error.message) ? "Run supabase/migrations/0041_rate_sheet_charges.sql once in Supabase's SQL Editor first." : error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ rate_sheet: data });
}
