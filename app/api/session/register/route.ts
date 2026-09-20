import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient, createServiceClient } from "@/lib/supabase/server";

const SESSION_COOKIE = "bp_session";

// Called right after a successful sign-in (password login, or setting a
// password from an invite/recovery link) to claim this device as the
// ONE active session for this account, per the user's request that the
// same login can't be active on two devices at once. middleware.ts
// checks every later request's SESSION_COOKIE against this row and
// signs out any request that no longer matches - i.e. whichever device
// registers here last wins, and every other device gets kicked out.
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const token = crypto.randomUUID();
  const service = createServiceClient();
  const { error } = await service.from("active_sessions").upsert(
    {
      user_id: user.id,
      session_token: token,
      device_label: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
