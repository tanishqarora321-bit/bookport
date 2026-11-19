import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const FIELDS = ["pier_pass", "discount_to_customer", "discount_from_supplier"] as const;

// The P&L page's typed values for one container (owner, 2026-11): Pier
// Pass, Discount to customer, Discount from supplier. Blank = 0.
export async function PATCH(req: NextRequest, { params }: { params: { trackingId: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json();
  const supabase = createServiceClient();

  const { data: trk } = await supabase.from("tracking").select("id").eq("id", params.trackingId).eq("company_id", me.company_id).maybeSingle();
  if (!trk) return NextResponse.json({ error: "Container not found" }, { status: 404 });

  const values: Record<string, number> = {};
  for (const f of FIELDS) {
    if (!(f in body)) continue;
    const raw = String(body[f] ?? "").trim();
    const num = raw === "" ? 0 : Number(raw.replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(num)) return NextResponse.json({ error: "Enter a number" }, { status: 400 });
    values[f] = Math.round(num * 100) / 100;
  }
  if (Object.keys(values).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { data, error } = await supabase
    .from("pnl_adjustments")
    .upsert({ tracking_id: params.trackingId, company_id: me.company_id, ...values, updated_at: new Date().toISOString() }, { onConflict: "tracking_id" })
    .select("tracking_id, pier_pass, discount_to_customer, discount_from_supplier")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ adjustment: data });
}
