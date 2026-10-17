import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { findOrCreateParty } from "@/lib/find-or-create-party";

export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const companyId = me.company_id;

  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.legal_name || !body.legal_name.trim()) {
    return NextResponse.json({ error: "Forwarder name is required" }, { status: 400 });
  }

  try {
    const { party } = await findOrCreateParty(supabase, companyId, "forwarder", body);
    return NextResponse.json({ forwarder: party });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
