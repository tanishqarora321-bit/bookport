"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

// Where an invite (or password-recovery) email link lands. Supabase's
// browser client auto-detects the #access_token=... hash fragment on
// this page's URL and turns it into a real session on its own
// (detectSessionInUrl defaults to true) - this page just waits for that,
// then asks the now-signed-in-but-passwordless invitee to set one.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase puts a failed/expired link's details in the hash as
    // #error=...&error_description=... instead of an access_token.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("error")) {
      setErrorMessage(hash.get("error_description")?.replace(/\+/g, " ") || "This link is invalid or has expired.");
      setStatus("error");
      return;
    }

    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setStatus("ready");
    });
    // In case the SIGNED_IN event already fired before this listener attached.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus("ready");
    });

    const timeout = setTimeout(() => {
      setStatus((s) => {
        if (s === "loading") {
          setErrorMessage("This link is invalid or has expired.");
          return "error";
        }
        return s;
      });
    }, 6000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
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
