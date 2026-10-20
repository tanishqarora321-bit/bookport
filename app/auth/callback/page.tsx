"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

// Where an invite (or password-recovery) email link lands. Does NOT rely
// on Supabase's automatic detectSessionInUrl hash-parsing - that turned
// out not to reliably fire here (possibly an @supabase/ssr version
// quirk, possibly an email-scanner having already touched the link;
// never fully confirmed). Instead this parses the #access_token/
// #refresh_token hash itself and calls setSession() explicitly, which
// also means a real failure shows Supabase's actual error message
// instead of a generic timeout-based guess.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));

    // Supabase puts a failed/expired link's details in the hash as
    // #error=...&error_description=... instead of tokens.
    if (hash.get("error")) {
      setErrorMessage(hash.get("error_description")?.replace(/\+/g, " ") || "This link is invalid or has expired.");
      setStatus("error");
      return;
    }

    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");

    if (!access_token || !refresh_token) {
      // No tokens and no #error= either - not a link this page knows how
      // to handle (e.g. opened directly, or already-cleared hash after a
      // prior successful run).
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

          {status === "error" && (
            <div className="flex flex-col gap-2">
              <div className="banner bn-crit" role="alert" style={{ fontSize: 13 }}>
                <span style={{ flex: 1 }}>{errorMessage}</span>
              </div>
              <p className="meta" style={{ margin: 0, textAlign: "center" }}>
                Ask your admin to send a fresh invite from Settings &amp; Control.
              </p>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={setNewPassword} className="flex flex-col gap-4">
              <div>
                <span className="badge b-acc">Invite accepted</span>
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
