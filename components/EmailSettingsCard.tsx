"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

type Config = {
  website?: string | null;
};

// Sending runs on one platform-wide Resend account (lib/send-email.ts).
// Display name/reply-to used to live here as one shared row per company,
// but that broke the moment a company had more than one teammate sending
// mail (everyone showed up as whoever last saved this card) - each sender
// now gets their own name/reply-to automatically from who's logged in
// (see Send Instructions, Team Invite). Website is genuinely company-wide,
// so it's the only thing left to configure here.
export default function EmailSettingsCard({ config, isAdmin }: { config: Config | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [website, setWebsite] = useState(config?.website ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/email-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setSuccess(true);
      setOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface border border-line rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Mail className="w-4 h-4" size={16} /> Email Sending
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Each teammate's emails already show their own name and reply-to automatically.
            {config?.website ? ` Website: ${config.website}` : " Set a company website to show on outgoing emails."}
          </p>
        </div>
        {isAdmin && !open && (
          <button onClick={() => { setOpen(true); setSuccess(false); }} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm font-medium">
            Edit
          </button>
        )}
      </div>

      {success && <p className="text-sm text-success bg-success-soft rounded-lg px-3 py-2 mt-3">Email settings saved.</p>}

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <input placeholder="Website (e.g. www.cninternationalusa.com)" className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink placeholder:text-muted" value={website} onChange={(e) => setWebsite(e.target.value)} />
          {error && <div className="col-span-2 text-xs text-cutoff">{error}</div>}
          <div className="col-span-2 flex gap-2">
            <button onClick={save} disabled={saving} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
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
