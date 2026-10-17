import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const STATUSES = ["trial", "active", "cancelled", "suspended"];

// Platform-owner-only. Changing a company's status to cancelled/suspended
// blocks every one of its users from signing in (getCurrentProfile()
// returns null for them) without touching/deleting any of their data -
// deliberately NOT a delete endpoint. A real "remove this company and
// its data" action is a much bigger, far more dangerous operation
// (dozens of tables, inconsistent ON DELETE behavior) and isn't built
// here on purpose - ask for it as its own deliberate task if it's ever
// actually needed.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!me.is_platform_owner) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, any> = {};

  if (body.subscription_status !== undefined) {
    if (!STATUSES.includes(body.subscription_status)) {
      return NextResponse.json({ error: `subscription_status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
    }
    updates.subscription_status = body.subscription_status;
  }
  if (body.seat_limit !== undefined) {
    const n = Number(body.seat_limit);
    if (!Number.isFinite(n) || n < 1) return NextResponse.json({ error: "seat_limit must be a positive number" }, { status: 400 });
    updates.seat_limit = Math.floor(n);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("companies").update(updates).eq("id", params.id).select().single();

  if (error) {
    if (error.code === "PGRST116") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ company: data });
}
