"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

type Config = {
  from_email?: string | null;
  from_name?: string | null;
  website?: string | null;
  configured?: boolean;
};

// Company-scoped Resend settings ("we need to mail some more things
// also in the future") - same Settings-row-not-code pattern as
// LetterheadSettingsCard, so a new client brings their own domain/
// Resend account rather than sharing this one's.
export default function EmailSettingsCard({ config, isAdmin }: { config: Config | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [fromEmail, setFromEmail] = useState(config?.from_email ?? "");
  const [fromName, setFromName] = useState(config?.from_name ?? "");
  const [website, setWebsite] = useState(config?.website ?? "");
  const [apiKey, setApiKey] = useState("");
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
        body: JSON.stringify({ from_email: fromEmail, from_name: fromName, website, api_key: apiKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setSuccess(true);
      setApiKey("");
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
            <Mail className="w-4 h-4" size={16} /> Email Sending (Resend)
          </h2>
          <p className="text-xs text-ink/40 mt-0.5">
            {config?.configured
              ? `Sending as ${config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email}`
              : "Not set up yet - emails (Booking Instructions, etc.) can't send until a Resend API key is added here."}
          </p>
        </div>
        {isAdmin && !open && (
          <button onClick={() => { setOpen(true); setSuccess(false); }} className="text-sm border px-3 py-1.5 rounded font-medium">
            {config?.configured ? "Edit" : "Set up"}
          </button>
        )}
      </div>

      {success && <p className="text-sm text-emerald-700 bg-emerald-50 rounded px-3 py-2 mt-3">Email settings saved.</p>}

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <input
            placeholder="From address (e.g. instructions@yourdomain.com)"
            className="border rounded px-2 py-1.5 text-sm col-span-2"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
          />
          <input placeholder="From name (e.g. CN International USA Inc.)" className="border rounded px-2 py-1.5 text-sm" value={fromName} onChange={(e) => setFromName(e.target.value)} />
          <input placeholder="Website (e.g. www.cninternationalusa.com)" className="border rounded px-2 py-1.5 text-sm" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <input
            type="password"
            placeholder={config?.configured ? "Resend API key (leave blank to keep current)" : "Resend API key"}
            className="border rounded px-2 py-1.5 text-sm col-span-2"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="col-span-2 text-xs text-ink/40">
            The domain in your From address must be verified in your Resend dashboard first (Resend gives you DNS records to add at your registrar).
          </p>
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
