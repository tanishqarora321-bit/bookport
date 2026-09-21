import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import { findOrCreateParty } from "@/lib/find-or-create-party";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.legal_name || !body.legal_name.trim()) {
    return NextResponse.json({ error: "Trucker name is required" }, { status: 400 });
  }

  try {
    const { party } = await findOrCreateParty(supabase, DEFAULT_COMPANY_ID, "trucker", body);
    return NextResponse.json({ trucker: party });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}