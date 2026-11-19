import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const ALLOWED = new Set(["draft", "confirmed", "in_transit", "delivered", "cancelled"]);

// Move to Closed / Cancelled / Booking & Instructions for many bookings in
// ONE request (owner, 2026-11: moving was slow - it sent one request per
// booking, one after another). A status change has no side effects beyond
// the bookings row itself (see PATCH /api/bookings/[id]).
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: any) => typeof x === "string") : [];
  const status = String(body.status ?? "");
  if (ids.length === 0) return NextResponse.json({ error: "No bookings selected" }, { status: 400 });
  if (!ALLOWED.has(status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });

  const supabase = createServiceClient();
  const updated: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("bookings")
      .update({ status })
      .in("id", ids.slice(i, i + 200))
      .eq("company_id", me.company_id)
      .select("id");
    if (error) return NextResponse.json({ error: error.message, updated }, { status: 500 });
    updated.push(...(data ?? []).map((d: any) => d.id));
  }
  return NextResponse.json({ updated });
}
