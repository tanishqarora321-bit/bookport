import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "Item name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("items")
    .insert({ company_id: DEFAULT_COMPANY_ID, name: body.name.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
