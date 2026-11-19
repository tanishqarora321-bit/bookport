import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { cleanCommissionFields } from "@/lib/commission-bookings";

// Commission Bookings (owner, 2026-11): added by hand only.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json();
  const fields = cleanCommissionFields(body, true);
  if ("error" in fields) return NextResponse.json({ error: fields.error }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("commission_bookings")
    .insert({ company_id: me.company_id, ...fields.values })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ booking: data });
}
