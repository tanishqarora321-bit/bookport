import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { computeProfitLoss } from "@/lib/profit-loss";

export async function GET(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam === "all" ? null : parseInt(yearParam || "", 10) || new Date().getFullYear();

  const supabase = createServiceClient();
  const result = await computeProfitLoss(supabase, me.company_id, year);

  return NextResponse.json(result);
}
