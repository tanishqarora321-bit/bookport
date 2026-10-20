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
    <section id="mail" className="card" aria-labelledby="mail-t">
      <div className="flex flex-wrap items-center gap-3 p-5 border-b border-line">
        <span className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0" aria-hidden="true">
          <Mail size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 id="mail-t" className="h2">Email Sending</h2>
          <div className="lbl mt-0.5">
            Each teammate&apos;s emails already show their own name and reply-to automatically.
            {config?.website ? ` Website: ${config.website}` : " Set a company website to show on outgoing emails."}
          </div>
        </div>
        {isAdmin && !open && (
          <button
            type="button"
            className="btn btn-s"
            aria-expanded={open}
            onClick={() => {
              setOpen(true);
              setSuccess(false);
            }}
          >
            Edit
          </button>
        )}
      </div>

      <div className="p-5 flex flex-col gap-4">
        {success && (
          <span role="status" className="meta" style={{ color: "var(--ok)", fontWeight: 600 }}>
            Email settings saved.
          </span>
        )}

        {open && (
          <>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="field" style={{ flex: "1 1 320px" }}>
                <label htmlFor="ws">Website (e.g. www.cninternationalusa.com)</label>
                <input id="ws" className="input" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
              <button type="button" className="btn btn-p" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
            {error && <span className="err">{error}</span>}
            <div>
              <button type="button" className="btn btn-g" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
