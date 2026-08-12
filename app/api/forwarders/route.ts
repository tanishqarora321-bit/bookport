import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.legal_name || !body.legal_name.trim()) {
    return NextResponse.json({ error: "Forwarder name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("parties")
    .insert({
      company_id: DEFAULT_COMPANY_ID,
      legal_name: body.legal_name.trim(),
      short_code: body.short_code?.trim() || null,
      country: body.country?.trim() || null,
      address: body.address?.trim() || null,
      roles: ["forwarder"],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ forwarder: data });
}
