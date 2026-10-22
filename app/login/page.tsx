"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Container, MapPinned, FileCheck2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

const FEATURES = [
  { icon: Container, text: "One booking, every party synced automatically" },
  { icon: MapPinned, text: "Live tracking from cutoff to delivery" },
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        body: JSON.stringify({ access_token: data.session?.access_token }),
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

  return (
    <div className="h-screen flex bg-surface overflow-hidden">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-navy">
        <div className="relative z-10 flex flex-col justify-between p-12 text-nav-text w-full">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <div className="font-semibold text-lg leading-tight">Ship-Sphere</div>
              <div className="text-xs text-nav-muted leading-tight">One Booking. All Connected.</div>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="text-3xl font-semibold leading-tight mb-4">
              Freight forwarding, without the spreadsheet chaos.
            </h1>
            <p className="text-nav-text/70 text-sm leading-relaxed mb-8">
              Bookings, tracking, documents and invoicing for your whole team — kept in sync, in one
              place, for every client you manage.
            </p>
            <div className="space-y-4">
              {FEATURES.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="rounded-full bg-nav-text/10 w-8 h-8 flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-nav-text" />
                  </div>
                  <span className="text-sm text-nav-text/85">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-nav-text/40">© {new Date().getFullYear()} Ship-Sphere. All rights reserved.</div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
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

          <div className="mb-6">
            <h1 className="h1">Welcome back</h1>
            <p className="sub">Sign in to your Ship-Sphere account.</p>
          </div>

          <form onSubmit={signIn} className="flex flex-col gap-4">
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="ib"
                  style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}
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

            <button
              type="submit"
              disabled={saving}
              className="btn btn-p w-full"
              style={{ height: 44, fontSize: 15 }}
            >
              {saving ? "Signing in…" : "Sign in"}
            </button>

            <p className="lbl" style={{ margin: 0, textAlign: "center" }}>
              Don&apos;t have an account yet? Ask your admin to invite you from Settings &amp; Control.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
