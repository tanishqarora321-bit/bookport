"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

type Config = {
  from_name?: string | null;
  reply_to?: string | null;
  website?: string | null;
};

// Sending runs on one platform-wide Resend account (lib/send-email.ts) -
// this card is just optional personalization (display name shown to
// recipients + the address their replies actually land at), not a
// setup gate. Works with zero input from the moment RESEND_API_KEY is
// configured on the deployment.
export default function EmailSettingsCard({ config, isAdmin }: { config: Config | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [fromName, setFromName] = useState(config?.from_name ?? "");
  const [replyTo, setReplyTo] = useState(config?.reply_to ?? "");
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
        body: JSON.stringify({ from_name: fromName, reply_to: replyTo, website }),
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
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Mail className="w-4 h-4" size={16} /> Email Sending
          </h2>
          <p className="text-xs text-ink/40 mt-0.5">
            {config?.from_name
              ? `Emails show as "${config.from_name}"${config.reply_to ? `, replies go to ${config.reply_to}` : ""}`
              : "Sending already works - this just sets the display name/reply-to shown to recipients."}
          </p>
        </div>
        {isAdmin && !open && (
          <button onClick={() => { setOpen(true); setSuccess(false); }} className="text-sm border px-3 py-1.5 rounded font-medium">
            Edit
          </button>
        )}
      </div>

      {success && <p className="text-sm text-emerald-700 bg-emerald-50 rounded px-3 py-2 mt-3">Email settings saved.</p>}

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <input placeholder="Display name (e.g. CN International USA Inc.)" className="border rounded px-2 py-1.5 text-sm col-span-2" value={fromName} onChange={(e) => setFromName(e.target.value)} />
          <input placeholder="Reply-to address (where replies should land)" className="border rounded px-2 py-1.5 text-sm" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
          <input placeholder="Website (e.g. www.cninternationalusa.com)" className="border rounded px-2 py-1.5 text-sm" value={website} onChange={(e) => setWebsite(e.target.value)} />
          {error && <div className="col-span-2 text-xs text-cutoff">{error}</div>}
          <div className="col-span-2 flex gap-2">
            <button onClick={save} disabled={saving} className="text-sm bg-ink text-white px-3 py-1.5 rounded">
              {saving ? "Saving…" : "Save"}
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
