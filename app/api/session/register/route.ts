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
  let { data: { user } } = await supabase.auth.getUser();

  // Cookie-based auth can momentarily miss a session that was JUST
  // issued by signInWithPassword/updateUser on the client a few
  // milliseconds earlier (the new sb-* cookie hadn't propagated to
  // this request yet) - this is what caused every fresh login to get
  // treated as "not signed in" here, which in turn left the OLD device's
  // active_sessions row in place, which then looked like an active
  // session on another device and signed the real new login right back
  // out. The caller can pass the access_token it already has from its
  // own signInWithPassword/updateUser call so this doesn't depend on
  // cookie timing at all.
  if (!user) {
    const body = await req.json().catch(() => ({}));
    if (body?.access_token) {
      const { data } = await supabase.auth.getUser(body.access_token);
      user = data.user;
    }
  }

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
