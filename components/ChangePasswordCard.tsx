"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
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
    <div className="bg-surface border border-line rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <KeyRound className="w-4 h-4" size={16} /> Your Account
          </h2>
          <p className="text-xs text-muted mt-0.5">Signed in as {email}</p>
        </div>
        {!open && (
          <button onClick={() => { setOpen(true); setSuccess(false); }} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm font-medium">
            Change Password
          </button>
        )}
      </div>

      {success && <p className="text-sm text-success bg-success-soft rounded-lg px-3 py-2 mt-3">Password updated.</p>}

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <input
            type="password"
            placeholder="New password (min 8 chars)"
            className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink placeholder:text-muted"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink placeholder:text-muted"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <div className="col-span-2 text-xs text-cutoff">{error}</div>}
          <div className="col-span-2 flex gap-2">
            <button onClick={save} disabled={saving} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60">
              {saving ? "Saving…" : "Save Password"}
            </button>
            <button onClick={() => setOpen(false)} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
