"use client";

import { useState } from "react";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ChangePasswordCard({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function save() {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSuccess(true);
    setPassword("");
    setConfirm("");
    setOpen(false);
  }

  return (
    <section id="acct" className="card" aria-labelledby="acct-t">
      <div className="ch">
        <span className="cico" aria-hidden="true">
          <KeyRound size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 id="acct-t" className="h2">Your Account</h2>
          <div className="lbl mt-0.5">Manage your sign-in and account security.</div>
        </div>
        {!open && (
          <button
            type="button"
            className="btn btn-s"
            aria-expanded={open}
            onClick={() => {
              setOpen(true);
              setSuccess(false);
            }}
          >
            Change Password
          </button>
        )}
      </div>

      <div className="sdet">
        <div className="sfield">
          <span>Signed in as</span>
          <strong>{email}</strong>
        </div>
        <div className="sfield">
          <span>Account status</span>
          <strong><span className="badge b-ok">Active</span></strong>
        </div>
      </div>

      {(success || open) && (
        <div className="cb">
          {success && (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--ok)" }}>
              <CheckCircle2 size={14} aria-hidden="true" />
              Password updated.
            </span>
          )}

          {open && (
            <>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                <div className="field">
                  <label htmlFor="np">New password (min 8 chars)</label>
                  <input
                    id="np"
                    type="password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cp">Confirm new password</label>
                  <input
                    id="cp"
                    type="password"
                    className="input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>

              {error && <span className="err">{error}</span>}

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-p" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save Password"}
                </button>
                <button type="button" className="btn btn-g" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
