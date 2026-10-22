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
  const body = await req.json().catch(() => ({}));

  // Cookie-based auth can momentarily miss a session that was JUST
  // issued by signInWithPassword/updateUser on the client a few
  // milliseconds earlier (the new sb-* cookie hadn't propagated to
  // this request yet) - this is what caused every fresh login to get
  // treated as "not signed in" here, which in turn left the OLD device's
  // active_sessions row in place, which then looked like an active
  // session on another device and signed the real new login right back
  // out. The caller always has the access_token from its own
  // signInWithPassword/updateUser call, so check that FIRST and skip the
  // cookie-based lookup entirely instead of trying it, expecting it to
  // miss, and falling back - that was a second wasted round trip to
  // Supabase on every single login.
  const { data } = body?.access_token
    ? await supabase.auth.getUser(body.access_token)
    : await supabase.auth.getUser();
  const user = data.user;

  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const token = crypto.randomUUID();
  const service = createServiceClient();
  // Was this account already active on a different device? This is purely
  // informational (so the caller can tell the person who just signed in
  // that it happened) - not a security gate, the new login always wins
  // either way - so it's safe to run alongside the upsert instead of
  // waiting on it first: the rare race where it reads after the upsert
  // already landed just under-reports hadOtherDevice, it never over-reports.
  const [{ data: previous }, { error }] = await Promise.all([
    service.from("active_sessions").select("session_token").eq("user_id", user.id).maybeSingle(),
    service.from("active_sessions").upsert(
      {
        user_id: user.id,
        session_token: token,
        device_label: req.headers.get("user-agent")?.slice(0, 200) ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    ),
  ]);
  const hadOtherDevice = !!previous && previous.session_token !== token;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res = NextResponse.json({ ok: true, hadOtherDevice });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
