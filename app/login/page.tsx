"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Inter } from "next/font/google";
import { Eye, EyeOff } from "lucide-react";
import { createClient, createAuthActionClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

const FEATURES = [
  { icon: "◇", text: "One booking, every party kept in sync" },
  { icon: "⌖", text: "Shipment milestones from cutoff to delivery" },
  { icon: "▤", text: "Documents, invoices and P&L in one place" },
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

  // An invite/recovery link's token lands here instead of /auth/callback
  // whenever its redirectTo isn't (yet) on Supabase's Redirect URL
  // allow-list - it falls back to the bare site root, which then routes
  // to /login (middleware preserves the query string on that redirect,
  // but a URL fragment never reaches the server to begin with, which is
  // why the hash case has to be checked client-side here too). Forward
  // either shape on to the page that actually knows what to do with it.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token") || hash.includes("error")) {
      window.location.replace("/auth/callback" + hash);
      return;
    }
    if (searchParams.get("code") || searchParams.get("error")) {
      window.location.replace("/auth/callback?" + searchParams.toString());
    }
  }, [searchParams]);

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
      // createAuthActionClient(), not createClient(): the regular
      // ssr-wrapped client silently forces PKCE regardless of its own
      // flowType option (see lib/supabase/client.ts), which only ever
      // works back in the exact browser that requested the reset - this
      // dedicated client actually honors flowType: "implicit" so the
      // link works from any device. app/auth/callback already handles a
      // recovery link's #access_token the same way it handles an
      // invite's - setSession, then show the "set a new password" form.
      const supabase = createAuthActionClient();
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
    <div className={`shell ${inter.className}`}>
      {/* Brand panel */}
      <section className="brand" aria-label="Ship-Sphere introduction">
        <div className="lockup">
          <Logo size={44} />
          <div>
            <p className="brandname">Ship-Sphere</p>
            <p className="tagline">One booking. All connected.</p>
          </div>
        </div>

        <div className="pitch">
          <p className="eyebrow">Freight operations, connected</p>
          <h1>Freight forwarding, without the spreadsheet chaos.</h1>
          <p className="desc">
            Bring bookings, tracking, documents and invoicing into one dependable workspace for your whole team.
          </p>
          <ul className="features">
            {FEATURES.map(({ icon, text }) => (
              <li key={text}>
                <span className="feat-icon" aria-hidden="true">{icon}</span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <footer className="footer">
          <span>© {new Date().getFullYear()} Ship-Sphere</span>
          <span>Built for freight teams</span>
        </footer>
      </section>

      {/* Form panel */}
      <section className="panel" aria-labelledby="title">
        <div className="form">
          {searchParams.get("reason") === "elsewhere" && (
            <div className="alert alert-info" role="status">
              You&apos;ve been signed out because this account signed in on another device. Ship-Sphere only allows
              one active session at a time.
            </div>
          )}

          {mode === "signin" ? (
            <>
              <p className="kicker">Your operations workspace</p>
              <h2 id="title">Welcome back</h2>
              <p className="intro">Sign in to continue to your Ship-Sphere workspace.</p>

              <form onSubmit={signIn}>
                <div className="field">
                  <label htmlFor="login-email">Work email</label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@company.com"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="login-password">Password</label>
                  <div className="pw-wrap">
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      className="toggle"
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {error && <p className="field-err" role="alert">{error}</p>}
                  {notice && <p className="field-ok" role="status">{notice}</p>}
                </div>

                <div className="meta">
                  <label className="remember">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
                  </label>
                  <button type="button" className="link-btn" onClick={() => { setMode("reset"); setError(null); }}>
                    Forgot password?
                  </button>
                </div>

                <button className="submit" type="submit" disabled={saving}>
                  {saving ? "Signing in…" : "Sign in to Ship-Sphere"}
                </button>
              </form>

              <p className="note">
                Need access? <strong>Ask your admin</strong> to invite you from Settings &amp; Control.
              </p>
              <p className="security">▣ Your workspace is protected by secure sign-in.</p>
            </>
          ) : (
            <>
              <h2>Reset your password</h2>
              <p className="intro">
                {resetSent
                  ? "If an account exists for that email, a reset link is on its way."
                  : "Enter your work email and we'll send you a link to set a new password."}
              </p>

              {resetSent ? (
                <>
                  <div className="alert alert-ok" role="status">
                    Check your inbox for the reset link. It may take a minute to arrive.
                  </div>
                  <button type="button" className="submit submit-secondary" onClick={backToSignIn}>
                    Back to sign in
                  </button>
                </>
              ) : (
                <form onSubmit={sendResetLink}>
                  <div className="field">
                    <label htmlFor="reset-email">Work email</label>
                    <input
                      id="reset-email"
                      type="email"
                      autoComplete="username"
                      placeholder="you@company.com"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    {resetError && <p className="field-err" role="alert">{resetError}</p>}
                  </div>
                  <button className="submit" type="submit" disabled={resetSending}>
                    {resetSending ? "Sending…" : "Send reset link"}
                  </button>
                  <button type="button" className="link-btn link-btn-center" onClick={backToSignIn}>
                    Back to sign in
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </section>

      <style jsx>{`
        .shell {
          --navy: #0b1735;
          --blue: #2f5fe8;
          --ink: #14213b;
          --muted: #65738b;
          --line: #dce4ef;
          --field: #f8faff;
          width: 100%;
          height: 100vh;
          height: 100dvh;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          overflow: hidden;
          color: var(--ink);
          background: #fff;
          -webkit-font-smoothing: antialiased;
        }
        .brand {
          min-width: 0;
          min-height: 0;
          background: var(--navy);
          color: #fff;
          padding: clamp(28px, 4.2vw, 64px);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
        }
        .lockup {
          display: flex;
          align-items: center;
          gap: 13px;
        }
        .brandname {
          margin: 0;
          font-size: 19px;
          font-weight: 750;
          letter-spacing: -0.035em;
        }
        .tagline {
          margin: 3px 0 0;
          color: #bdcbed;
          font-size: 12px;
        }
        .pitch {
          width: min(100%, 550px);
          margin: auto 0;
          padding: 40px 0;
        }
        .eyebrow {
          color: #a9c0ff;
          font-size: 11px;
          text-transform: uppercase;
          font-weight: 750;
          letter-spacing: 0.16em;
          margin: 0 0 18px;
        }
        .pitch h1 {
          max-width: 540px;
          margin: 0;
          font-size: clamp(32px, 3.25vw, 48px);
          line-height: 1.12;
          letter-spacing: -0.055em;
          font-weight: 730;
        }
        .desc {
          color: #d0d9ec;
          max-width: 480px;
          margin: 22px 0 0;
          font-size: 15px;
          line-height: 1.75;
        }
        .features {
          list-style: none;
          padding: 0;
          margin: 30px 0 0;
          display: grid;
          gap: 17px;
        }
        .features li {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #f3f6ff;
          font-size: 13px;
          line-height: 1.5;
        }
        .feat-icon {
          width: 30px;
          height: 30px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border: 1px solid #ffffff35;
          border-radius: 9px;
          color: #bcd0ff;
          background: #ffffff0b;
        }
        .footer {
          color: #aebbd5;
          font-size: 11px;
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }
        .panel {
          min-width: 0;
          min-height: 0;
          background: #fff;
          display: grid;
          place-items: center;
          padding: clamp(24px, 5vw, 72px);
          overflow: auto;
        }
        .form {
          width: min(100%, 410px);
          margin: auto;
        }
        .kicker {
          margin: 0 0 12px;
          color: var(--blue);
          font-size: 12px;
          font-weight: 750;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .form h2 {
          margin: 0;
          font-size: clamp(28px, 2.4vw, 34px);
          line-height: 1.18;
          letter-spacing: -0.045em;
          font-weight: 750;
        }
        .intro {
          color: var(--muted);
          margin: 10px 0 28px;
          font-size: 14px;
          line-height: 1.6;
        }
        .field {
          margin-top: 18px;
        }
        .field label {
          display: block;
          font-size: 13px;
          font-weight: 650;
          color: #263650;
          margin-bottom: 8px;
        }
        .field input[type="email"],
        .field input[type="password"],
        .field input[type="text"] {
          width: 100%;
          height: 48px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: var(--field);
          color: var(--ink);
          padding: 0 14px;
          outline: none;
          font: inherit;
        }
        .field input:focus {
          border-color: #80a4ff;
          background: #fff;
          box-shadow: 0 0 0 3px #507df526;
        }
        .pw-wrap {
          position: relative;
        }
        .pw-wrap input {
          padding-right: 52px !important;
        }
        .toggle {
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          height: 36px;
          width: 38px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .toggle:hover {
          background: #edf2fb;
        }
        .field-err {
          color: #c81e1e;
          font-size: 12px;
          font-weight: 500;
          margin: 8px 0 0;
        }
        .field-ok {
          color: #047857;
          font-size: 12px;
          font-weight: 500;
          margin: 8px 0 0;
        }
        .meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin: 13px 0 22px;
          font-size: 12px;
        }
        .remember {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--muted);
          font-weight: 400;
          cursor: pointer;
        }
        .remember input {
          accent-color: var(--blue);
          margin: 0;
        }
        .link-btn {
          background: none;
          border: 0;
          padding: 0;
          cursor: pointer;
          color: #2857d8;
          text-decoration: none;
          font-weight: 650;
          font-size: 12px;
          font-family: inherit;
        }
        .link-btn:hover {
          text-decoration: underline;
        }
        .link-btn-center {
          display: block;
          width: 100%;
          text-align: center;
          margin-top: 18px;
          font-size: 13px;
        }
        .submit {
          width: 100%;
          min-height: 49px;
          border: 0;
          border-radius: 10px;
          background: var(--blue);
          color: #fff;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          box-shadow: 0 5px 12px #2f5fe826;
          font-family: inherit;
        }
        .submit:hover {
          background: #244dcc;
        }
        .submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .submit-secondary {
          margin-top: 14px;
          background: #eef2fb;
          color: var(--ink);
          box-shadow: none;
        }
        .submit-secondary:hover {
          background: #e2e9f8;
        }
        .note {
          color: var(--muted);
          font-size: 12px;
          line-height: 1.65;
          text-align: center;
          margin: 20px 0 0;
        }
        .note strong {
          color: #263650;
        }
        .security {
          display: flex;
          justify-content: center;
          gap: 7px;
          color: #7c8799;
          font-size: 11px;
          margin-top: 26px;
        }
        .alert {
          border-radius: 9px;
          padding: 12px 14px;
          font-size: 13px;
          line-height: 1.55;
          margin-bottom: 22px;
        }
        .alert-info {
          background: #e5f2fa;
          color: #0369a1;
          border: 1px solid #bae1f3;
        }
        .alert-ok {
          background: #e6f6ef;
          color: #047857;
          border: 1px solid #b9e8d2;
          margin-bottom: 0;
        }
        button:focus-visible,
        .toggle:focus-visible,
        .link-btn:focus-visible {
          outline: 3px solid #80a4ff;
          outline-offset: 3px;
        }
        @media (max-width: 820px) {
          .brand {
            padding: 28px;
          }
          .panel {
            padding: 28px;
          }
          .desc {
            font-size: 14px;
          }
          .features li {
            font-size: 12px;
          }
        }
        @media (max-width: 640px) {
          .shell {
            height: auto;
            min-height: 100vh;
            min-height: 100dvh;
            grid-template-columns: minmax(0, 1fr);
            overflow: visible;
          }
          .brand {
            padding: 22px;
            overflow: visible;
          }
          .pitch {
            padding: 28px 0 8px;
            margin: 0;
          }
          .eyebrow {
            margin-bottom: 11px;
          }
          .pitch h1 {
            font-size: 29px;
          }
          .desc {
            margin-top: 12px;
            font-size: 13px;
            line-height: 1.6;
          }
          .features {
            margin-top: 18px;
            gap: 10px;
          }
          .feat-icon {
            width: 28px;
            height: 28px;
          }
          .footer {
            margin-top: 24px;
            font-size: 10px;
          }
          .panel {
            padding: 34px 22px 40px;
            overflow: visible;
          }
          .form {
            width: min(100%, 420px);
          }
          .intro {
            margin-bottom: 22px;
          }
        }
        @media (max-height: 650px) and (min-width: 641px) {
          .brand {
            padding-top: 22px;
            padding-bottom: 22px;
          }
          .pitch {
            padding: 18px 0;
          }
          .pitch h1 {
            font-size: clamp(27px, 3vw, 38px);
          }
          .desc {
            margin-top: 12px;
            line-height: 1.5;
          }
          .features {
            margin-top: 16px;
            gap: 9px;
          }
          .panel {
            padding-top: 18px;
            padding-bottom: 18px;
          }
          .intro {
            margin-bottom: 16px;
          }
          .field {
            margin-top: 13px;
          }
          .meta {
            margin-bottom: 15px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .shell * {
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}
