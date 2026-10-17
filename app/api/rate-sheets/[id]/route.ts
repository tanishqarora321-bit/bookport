import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

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
