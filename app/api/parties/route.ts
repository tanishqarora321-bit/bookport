import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { findOrCreateParty } from "@/lib/find-or-create-party";

export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.legal_name || !body.legal_name.trim()) {
    return NextResponse.json({ error: "Account name is required" }, { status: 400 });
  }

  try {
    const { party } = await findOrCreateParty(supabase, me.company_id, "buyer", body);
    return NextResponse.json({ party });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
