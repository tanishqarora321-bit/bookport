import { NextResponse } from "next/server";
import { getCurrentProfile, getExpiredTrialInfo } from "@/lib/supabase/session";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ user: null, trial_expired: await getExpiredTrialInfo() });
  return NextResponse.json({ user: profile });
}
