import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { cleanCommissionFields } from "@/lib/commission-bookings";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const fields = cleanCommissionFields(await req.json(), false);
  if ("error" in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  if (Object.keys(fields.values).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("commission_bookings")
    .update({ ...fields.values, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.code === "PGRST116" ? "Not found" : error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
  return NextResponse.json({ booking: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createServiceClient();
  const { error } = await supabase.from("commission_bookings").delete().eq("id", params.id).eq("company_id", me.company_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
