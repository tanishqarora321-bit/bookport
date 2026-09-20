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
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <KeyRound className="w-4 h-4" size={16} /> Your Account
          </h2>
          <p className="text-xs text-ink/40 mt-0.5">Signed in as {email}</p>
        </div>
        {!open && (
          <button onClick={() => { setOpen(true); setSuccess(false); }} className="text-sm border px-3 py-1.5 rounded font-medium">
            Change Password
          </button>
        )}
      </div>

      {success && <p className="text-sm text-emerald-700 bg-emerald-50 rounded px-3 py-2 mt-3">Password updated.</p>}

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <input
            type="password"
            placeholder="New password (min 8 chars)"
            className="border rounded px-2 py-1.5 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            className="border rounded px-2 py-1.5 text-sm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <div className="col-span-2 text-xs text-cutoff">{error}</div>}
          <div className="col-span-2 flex gap-2">
            <button onClick={save} disabled={saving} className="text-sm bg-ink text-white px-3 py-1.5 rounded">
              {saving ? "Saving…" : "Save Password"}
            </button>
            <button onClick={() => setOpen(false)} className="text-sm border px-3 py-1.5 rounded">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
