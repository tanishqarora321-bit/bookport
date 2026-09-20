import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/session";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ user: null });
  return NextResponse.json({ user: profile });
}
