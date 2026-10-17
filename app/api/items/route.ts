import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "Item name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("items")
    .insert({ company_id: me.company_id, name: body.name.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
