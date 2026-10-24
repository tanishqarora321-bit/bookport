"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

// Where an invite or password-recovery email link lands. Both shapes
// arrive the same way now: the classic #access_token/#refresh_token
// hash (hash.get("type") says which). Admin-generated invites
// (app/api/team/invite) always used this - a separate server-side
// mechanism unaffected by the browser client's own flowType. Self-
// service password resets (resetPasswordForEmail) used PKCE's ?code=
// for a while instead (see the removed flowType:"pkce" in
// lib/supabase/client.ts for the full history) but that broke the
// ordinary case of requesting a reset on one device and opening the
// email on another - the verifier it needs only ever exists in the one
// browser that asked for it. Back on the hash flow for both now; the
// ?code= branch below stays as a harmless fallback in case anything
// ever requests PKCE again, but nothing in this app does today.
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackInner />
    </Suspense>
  );
}

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "confirm" | "ready" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  // Held until the person actually clicks "Continue" below - see the
  // "confirm" status branch for why this can't just run from the effect.
  const [pendingTokens, setPendingTokens] = useState<{ access_token: string; refresh_token: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  // "invite" vs "recovery" - from the link's own hash.get("type") - just
  // picks the right copy below ("accept your invite" reads oddly for
  // someone resetting a password they already had).
  const [linkType, setLinkType] = useState<"invite" | "recovery">("invite");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("type") === "recovery" || searchParams.get("type") === "recovery") setLinkType("recovery");

    // An expired/already-used link's details can arrive either way
    // depending on which flow generated it - PKCE (password reset)
    // delivers them as ordinary ?query params, the classic flow
    // (invites) puts them in the #hash instead.
    const errorDescription = searchParams.get("error_description") || hash.get("error_description");
    if (searchParams.get("error") || hash.get("error")) {
      setErrorMessage(errorDescription?.replace(/\+/g, " ") || "This link is invalid or has expired.");
      setStatus("error");
      return;
    }

    const code = searchParams.get("code");
    if (code) {
      const supabase = createClient();
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (error) {
          setErrorMessage(error.message);
          setStatus("error");
          return;
        }
        if (data.session) {
          // Clear the code from the URL/history now that it's been used -
          // it's a live credential and shouldn't linger in the address
          // bar or browser history.
          window.history.replaceState(null, "", window.location.pathname);
          setAccessToken(data.session.access_token);
          setStatus("ready");
        }
      });
      return;
    }

    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");

    if (!access_token || !refresh_token) {
      // Nothing this page knows how to handle (no code, no tokens, no
      // error) - e.g. opened directly, or already-cleared after a prior
      // successful run.
      setErrorMessage(
        hash.get("type") === "recovery" || searchParams.get("type") === "recovery"
          ? "No reset information found in this link. Request a new password reset link."
          : "No invite information found in this link. Ask your admin to send a fresh invite."
      );
      setStatus("error");
      return;
    }

    // Hold the tokens rather than calling setSession() immediately - this
    // hash-based link can only be consumed once, and a real person isn't
    // the only thing that can load this page: a corporate email scanner
    // or link-preview bot visiting it (some execute JS, not just an HTTP
    // GET) would burn it before the actual invitee ever clicks, leaving
    // them an "expired" link moments later with nothing they did wrong.
    // Requiring an explicit "Continue" click (below) before the token is
    // ever exchanged means a passive page load can't consume it - only a
    // deliberate click can. The PKCE/?code= path above doesn't need this:
    // it's already immune, since completing it requires a code_verifier
    // only the real browser that requested the link ever has.
    setPendingTokens({ access_token, refresh_token });
    setStatus("confirm");
  }, []);

  async function confirmInvite() {
    if (!pendingTokens) return;
    setConfirming(true);
    const supabase = createClient();
    // Clear any session already sitting in this browser first (e.g. the
    // same device still signed in as whoever last used it here) - this
    // link's tokens are the ones that should win, unambiguously, not
    // whatever was already active. "local" scope only drops this
    // browser's own stored tokens, not anyone else's session elsewhere.
    await supabase.auth.signOut({ scope: "local" });
    const { data, error } = await supabase.auth.setSession(pendingTokens);
    if (error) {
      setErrorMessage(error.message);
      setStatus("error");
      setConfirming(false);
      return;
    }
    if (data.session) {
      // Clear the token hash from the URL/history now that it's been
      // used - it's a live credential and shouldn't linger in the
      // address bar or browser history.
      window.history.replaceState(null, "", window.location.pathname);
      setAccessToken(data.session.access_token);
      setStatus("ready");
    }
    setConfirming(false);
  }

  async function setNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setSaveError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setSaveError("Passwords don't match.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }
    // Claim this device as the account's one active session, same as a
    // normal password sign-in (see app/api/session/register) - passing
    // the access_token explicitly so this doesn't depend on the session
    // cookie having propagated to this request yet (see the matching
    // comment in app/login/page.tsx for why that mattered in practice).
    const registerRes = await fetch("/api/session/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    });
    if (!registerRes.ok) {
      const json = await registerRes.json().catch(() => ({}));
      setSaveError(json.error || "Password saved, but couldn't finish setting up your session. Please try signing in.");
      setSaving(false);
      return;
    }
    // A brand-new password silently dropping you straight into the app
    // with zero on-screen confirmation reads as "did that even work?" -
    // especially right after clicking a link that may have failed
    // before. Show the result explicitly instead of a silent redirect.
    setStatus("success");
    setSaving(false);
  }

  function continueToApp() {
    router.push("/bookings");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-surface-2 flex items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <Logo size={40} />
          <div>
            <div className="font-semibold text-lg leading-tight text-ink">Ship-Sphere</div>
            <div className="text-xs text-muted leading-tight">One Booking. All Connected.</div>
          </div>
        </div>

        <div className="card p-6">
          {status === "loading" && (
            <div className="banner bn-info" role="status" style={{ fontSize: 13 }}>
              <span style={{ flex: 1 }}>Confirming your invite…</span>
            </div>
          )}

          {status === "confirm" && (
            <div className="flex flex-col gap-4">
              <div>
                <span className="badge b-acc">{linkType === "recovery" ? "Reset link received" : "Invite received"}</span>
                <h1 className="h1" style={{ marginTop: 12 }}>
                  {linkType === "recovery" ? "Reset your password" : "Accept your invite"}
                </h1>
                <p className="sub">
                  {linkType === "recovery"
                    ? "Click below to confirm this is you and set a new password."
                    : "Click below to confirm this invite and set your password."}
                </p>
              </div>
              <button
                type="button"
                onClick={confirmInvite}
                disabled={confirming}
                className="btn btn-p w-full"
                style={{ height: 44, fontSize: 15 }}
              >
                {confirming ? "Confirming…" : "Continue"}
              </button>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col gap-4">
              <div>
                <span className="badge b-ok">
                  {linkType === "recovery" ? "Password reset" : "Account ready"}
                </span>
                <h1 className="h1" style={{ marginTop: 12 }}>
                  {linkType === "recovery" ? "Your password has been changed" : "You're all set"}
                </h1>
                <p className="sub">
                  {linkType === "recovery"
                    ? "Use your new password next time you sign in. You're already signed in on this device."
                    : "You're signed in and ready to go."}
                </p>
              </div>
              <button
                type="button"
                onClick={continueToApp}
                className="btn btn-p w-full"
                style={{ height: 44, fontSize: 15 }}
              >
                Continue to Ship-Sphere
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col gap-2">
              <div className="banner bn-crit" role="alert" style={{ fontSize: 13 }}>
                <span style={{ flex: 1 }}>{errorMessage}</span>
              </div>
              <p className="meta" style={{ margin: 0, textAlign: "center" }}>
                {linkType === "recovery"
                  ? "Request a new password reset link from the login page."
                  : "Ask your admin to send a fresh invite from Settings & Control."}
              </p>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={setNewPassword} className="flex flex-col gap-4">
              <div>
                <span className="badge b-acc">{linkType === "recovery" ? "Identity confirmed" : "Invite accepted"}</span>
                <h1 className="h1" style={{ marginTop: 12 }}>Set your password</h1>
                <p className="sub">You&apos;ll use it with your email to sign in from now on.</p>
              </div>
              <div className="field">
                <label htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="At least 8 characters"
                />
                <span className="help">At least 8 characters.</span>
              </div>
              <div className="field">
                <label htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="input"
                />
              </div>
              {saveError && (
                <span className="err" role="alert">
                  {saveError}
                </span>
              )}
              <button
                type="submit"
                disabled={saving}
                className="btn btn-p w-full"
                style={{ height: 44, fontSize: 15 }}
              >
                {saving ? "Saving…" : "Set password & continue"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
