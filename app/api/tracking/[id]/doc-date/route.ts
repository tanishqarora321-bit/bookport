import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { getTrackingDocContext } from "@/lib/tracking-doc-context";
import { defaultDocDate } from "@/lib/doc-print-date";

// The BL date and the default printed date (3 days before it) for the
// Fumigation / COO / Set of Documents "which date?" prompt.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const ctx = await getTrackingDocContext(createServiceClient(), params.id, me.company_id);
  if (!ctx) return NextResponse.json({ error: "Tracking entry not found" }, { status: 404 });
  const bl = ctx.booking?.bl_date ? String(ctx.booking.bl_date).slice(0, 10) : null;
  return NextResponse.json({ bl_date: bl, default_date: defaultDocDate(bl) });
}
