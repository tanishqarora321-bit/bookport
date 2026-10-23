"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

// Where an invite (or password-recovery) email link lands. Two different
// link shapes arrive here:
// - Admin-generated invites (app/api/team/invite) use Supabase's admin
//   generateLink API, which is a separate server-side mechanism that
//   still produces the classic #access_token/#refresh_token hash - this
//   page's own explicit setSession() handles that (not Supabase's
//   automatic detectSessionInUrl hash-parsing, which turned out not to
//   reliably fire here - possibly an @supabase/ssr version quirk,
//   possibly an email scanner having already touched the link; never
//   fully confirmed either way for THIS path).
// - Self-service password resets (resetPasswordForEmail, called from
//   this browser) use the PKCE flow instead (see lib/supabase/client.ts
//   for why) - those links carry a ?code= query param, exchanged via
//   exchangeCodeForSession() against the verifier this same browser
//   stashed when it requested the reset.
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
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));

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
      setErrorMessage("No invite information found in this link. Ask your admin to send a fresh invite.");
      setStatus("error");
      return;
    }

    const supabase = createClient();
    supabase.auth.setSession({ access_token, refresh_token }).then(({ data, error }) => {
      if (error) {
        setErrorMessage(error.message);
        setStatus("error");
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
    });
    // searchParams is a stable object identity from useSearchParams() for
    // the initial load this page cares about - re-running this on every
    // params change isn't needed and would re-trigger the one-time
    // exchange/setSession call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    router.push("/bookings");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <Logo size={40} />
          <div>
            <div className="font-semibold text-lg leading-tight text-ink">Ship-Sphere</div>
            <div className="text-xs text-slate-400 leading-tight">One Booking. All Connected.</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          {status === "loading" && <p className="text-sm text-ink/60 text-center">Confirming your invite…</p>}

          {status === "error" && (
            <div className="text-center space-y-2">
              <p className="text-sm text-cutoff">{errorMessage}</p>
              <p className="text-xs text-slate-400">Ask your admin to send a fresh invite from Settings &amp; Control.</p>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={setNewPassword} className="space-y-4">
              <h1 className="text-lg font-semibold text-ink">Set your password</h1>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1">New password</label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1">Confirm password</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              {saveError && <div className="text-sm text-cutoff">{saveError}</div>}
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-accent text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-60"
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
