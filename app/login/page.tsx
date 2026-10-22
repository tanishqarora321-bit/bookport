"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Container, MapPinned, FileCheck2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

const FEATURES = [
  { icon: Container, text: "One booking, every party kept in sync" },
  { icon: MapPinned, text: "Shipment milestones from cutoff to delivery" },
  { icon: FileCheck2, text: "Documents, invoices and P&L in one place" },
];

// useSearchParams() opts the page out of static rendering unless it's
// wrapped in Suspense - this is that wrapper; LoginForm has the actual
// page content and logic.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Forgot-password is a small inline mode swap rather than a separate
  // route - same form, same page, nothing new to wire into middleware's
  // PUBLIC_PATHS.
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // An invite/recovery link's #access_token lands here instead of
  // /auth/callback whenever its redirectTo isn't (yet) on Supabase's
  // Redirect URL allow-list - it falls back to the bare site root,
  // which then routes to /login. Forward it on to the page that
  // actually knows how to set a password from it, hash intact.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token") || hash.includes("error")) {
      window.location.replace("/auth/callback" + hash);
    }
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Supabase's own message ("Invalid login credentials") deliberately
        // doesn't say whether the email or the password was wrong - that's
        // intentional (it stops someone from using this form to find out
        // which emails have accounts) and shows up instantly either way.
        setError(error.message);
        return;
      }
      // Claim this device as the one active session for the account -
      // any other device currently signed in gets signed out on its next
      // request (see app/api/session/register and middleware.ts). Passing
      // the access_token directly (rather than relying on the just-set
      // session cookie already having propagated to this very next
      // request) is what actually makes this reliable - without it, this
      // call could come back "not signed in" and leave the previous
      // device's session in place, which then immediately signs this
      // brand new login right back out as if it were "the other device".
      const registerRes = await fetch("/api/session/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: data.session?.access_token, remember }),
      });
      const registerJson = await registerRes.json().catch(() => ({}));
      if (!registerRes.ok) {
        setError(registerJson.error || "Signed in, but couldn't finish setting up your session. Please try again.");
        return;
      }
      if (registerJson.hadOtherDevice) {
        // Brief, visible confirmation that the other device was actually
        // signed out - the alternative is silence here and that device
        // finding out on its own next click, which reads as a bug rather
        // than the intended one-session-at-a-time behavior.
        setNotice("Signed in. You were logged out of your other device.");
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      router.push("/bookings");
      router.refresh();
    } catch {
      // A network failure here (blocked request, offline, a redirect the
      // browser refuses to follow cross-origin, etc.) must never leave the
      // button stuck on "Signing in..." forever with no way to retry.
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function sendResetLink(e: React.FormEvent) {
    e.preventDefault();
    setResetSending(true);
    setResetError(null);
    try {
      const supabase = createClient();
      // app/auth/callback already handles a recovery link's #access_token
      // the same way it handles an invite link's - setSession, then show
      // the "set a new password" form. No new page needed for this.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      // Supabase returns success here regardless of whether the email has
      // an account (so does this UI) - the alternative lets this form be
      // used to find out which emails are registered.
      if (error && error.status !== undefined && error.status >= 500) {
        setResetError("Couldn't send the reset link right now. Please try again.");
        return;
      }
      setResetSent(true);
    } catch {
      setResetError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setResetSending(false);
    }
  }

  function backToSignIn() {
    setMode("signin");
    setResetSent(false);
    setResetError(null);
  }

  return (
    <div className="h-screen flex bg-surface overflow-hidden">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-navy">
        <div className="relative z-10 flex flex-col justify-between p-12 text-nav-text w-full">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <div>
              <div className="font-semibold text-lg leading-tight">Ship-Sphere</div>
              <div className="text-xs text-nav-muted leading-tight">One Booking. All Connected.</div>
            </div>
          </div>

          <div className="max-w-md my-auto py-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-nav-text/70 mb-[18px]">
              Freight operations, connected
            </p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight mb-[22px]">
              Freight forwarding, without the spreadsheet chaos.
            </h1>
            <p className="text-nav-text/80 text-[15px] leading-relaxed">
              Bookings, tracking, documents and invoicing for your whole team — kept in sync, in one
              place, for every client you manage.
            </p>
            <div className="flex flex-col gap-[17px] mt-[30px]">
              {FEATURES.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid rgba(255,255,255,0.21)", background: "rgba(255,255,255,0.04)" }}
                  >
                    <Icon size={14} className="text-nav-text/80" />
                  </div>
                  <span className="text-[13px] text-nav-text/95">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 text-[11px] text-nav-text/50">
            <span>© {new Date().getFullYear()} Ship-Sphere</span>
            <span>Built for freight teams</span>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-[410px] py-6">
          <div className="flex items-center gap-3 mb-8 justify-center lg:hidden">
            <Logo size={40} />
            <div>
              <div className="font-semibold text-lg leading-tight text-ink">Ship-Sphere</div>
              <div className="text-xs text-muted leading-tight">One Booking. All Connected.</div>
            </div>
          </div>

          {searchParams.get("reason") === "elsewhere" && (
            <div className="banner bn-info mb-4" role="status" style={{ fontSize: 13, alignItems: "flex-start" }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5v.5" />
              </svg>
              <span style={{ flex: 1 }}>
                You&apos;ve been signed out because this account signed in on another device. Ship-Sphere only allows one active session at a time.
              </span>
            </div>
          )}

          {mode === "signin" ? (
            <>
              <p className="text-[12px] font-bold text-accent uppercase tracking-[0.08em] mb-3">Your operations workspace</p>
              <div className="mb-6">
                <h1 className="h1">Welcome back</h1>
                <p className="sub">Sign in to continue to your Ship-Sphere workspace.</p>
              </div>

              <form onSubmit={signIn} className="flex flex-col gap-4">
                <div className="field">
                  <label htmlFor="login-email">Work email</label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    style={{ height: 48, borderRadius: 10 }}
                    placeholder="you@company.com"
                  />
                </div>

                <div className="field">
                  <label htmlFor="login-password">Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input"
                      placeholder="Enter your password"
                      style={{ height: 48, borderRadius: 10, paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="ib"
                      style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)" }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {error && (
                    <span className="err" role="alert">
                      {error}
                    </span>
                  )}
                  {notice && (
                    <span className="help" role="status" style={{ color: "var(--ok)" }}>
                      {notice}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3" style={{ margin: "2px 0 4px", fontSize: 13 }}>
                  <label className="flex items-center gap-2 text-muted" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: "var(--accent)" }}
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => { setMode("reset"); setError(null); }}
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--accent)", fontWeight: 600, fontSize: 13 }}
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-p w-full"
                  style={{ height: 48, fontSize: 15 }}
                >
                  {saving ? "Signing in…" : "Sign in to Ship-Sphere"}
                </button>

                <p className="lbl" style={{ margin: 0, textAlign: "center" }}>
                  Need access? Ask your admin to invite you from Settings &amp; Control.
                </p>
              </form>

              <p className="meta" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 24 }}>
                <ShieldCheck size={13} />
                Your workspace is protected by secure sign-in.
              </p>
            </>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="h1">Reset your password</h1>
                <p className="sub">
                  {resetSent
                    ? "If an account exists for that email, a reset link is on its way."
                    : "Enter your work email and we'll send you a link to set a new password."}
                </p>
              </div>

              {resetSent ? (
                <div className="flex flex-col gap-4">
                  <div className="banner bn-ok" role="status" style={{ fontSize: 13 }}>
                    <span style={{ flex: 1 }}>Check your inbox for the reset link. It may take a minute to arrive.</span>
                  </div>
                  <button type="button" onClick={backToSignIn} className="btn w-full" style={{ height: 48 }}>
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={sendResetLink} className="flex flex-col gap-4">
                  <div className="field">
                    <label htmlFor="reset-email">Work email</label>
                    <input
                      id="reset-email"
                      type="email"
                      required
                      autoFocus
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input"
                      style={{ height: 48, borderRadius: 10 }}
                      placeholder="you@company.com"
                    />
                    {resetError && (
                      <span className="err" role="alert">
                        {resetError}
                      </span>
                    )}
                  </div>

                  <button type="submit" disabled={resetSending} className="btn btn-p w-full" style={{ height: 48, fontSize: 15 }}>
                    {resetSending ? "Sending…" : "Send reset link"}
                  </button>

                  <button
                    type="button"
                    onClick={backToSignIn}
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--accent)", fontWeight: 600, fontSize: 13, textAlign: "center" }}
                  >
                    Back to sign in
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
