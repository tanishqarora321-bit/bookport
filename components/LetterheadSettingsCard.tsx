"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

type Config = {
  company_name?: string;
  address_lines?: string[];
  phone?: string;
  fax?: string;
  email?: string;
  accent_color?: string;
  shipper_declaration?: string;
};

// Company letterhead used on every generated PDF (Final Invoice +
// Booking Instructions) - a Settings row to edit, not a code change, so
// onboarding a new client's own letterhead/declaration wording is a form
// submit (per Tanishq's pick: "New Settings & Control field").
export default function LetterheadSettingsCard({ config, isAdmin }: { config: Config | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState(config?.company_name ?? "");
  const [addressLines, setAddressLines] = useState((config?.address_lines ?? [""]).join("\n"));
  const [phone, setPhone] = useState(config?.phone ?? "");
  const [fax, setFax] = useState(config?.fax ?? "");
  const [email, setEmail] = useState(config?.email ?? "");
  const [accentColor, setAccentColor] = useState(config?.accent_color ?? "#0f172a");
  const [shipperDeclaration, setShipperDeclaration] = useState(config?.shipper_declaration ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/document-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          address_lines: addressLines.split("\n"),
          phone,
          fax,
          email,
          accent_color: accentColor,
          shipper_declaration: shipperDeclaration,
        }),
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
            <FileText className="w-4 h-4" size={16} /> Document Letterhead
          </h2>
          <p className="text-xs text-muted mt-0.5">
            {config?.company_name ? `Used on Final Invoice & Booking Instructions PDFs: ${config.company_name}` : "Not set up yet"}
          </p>
        </div>
        {isAdmin && !open && (
          <button onClick={() => { setOpen(true); setSuccess(false); }} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm font-medium">
            Edit
          </button>
        )}
      </div>

      {success && <p className="text-sm text-success bg-success-soft rounded-lg px-3 py-2 mt-3">Letterhead updated.</p>}

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <input
            placeholder="Company name"
            className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm col-span-2 text-ink placeholder:text-muted"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <textarea
            placeholder="Address (one line per row)"
            className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm col-span-2 text-ink placeholder:text-muted"
            rows={3}
            value={addressLines}
            onChange={(e) => setAddressLines(e.target.value)}
          />
          <input placeholder="Phone" className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink placeholder:text-muted" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input placeholder="Fax" className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink placeholder:text-muted" value={fax} onChange={(e) => setFax(e.target.value)} />
          <input placeholder="Email" className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm text-ink placeholder:text-muted" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Accent color</span>
            <input type="color" className="border border-line rounded-lg h-8 w-14 bg-surface" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
          </div>
          <textarea
            placeholder="Shipper declares clause (use {destination} where the port of delivery should be inserted)"
            className="bg-surface border border-line rounded-lg px-2 py-1.5 text-sm col-span-2 text-ink placeholder:text-muted"
            rows={3}
            value={shipperDeclaration}
            onChange={(e) => setShipperDeclaration(e.target.value)}
          />
          {error && <div className="col-span-2 text-xs text-cutoff">{error}</div>}
          <div className="col-span-2 flex gap-2">
            <button onClick={save} disabled={saving} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60">
              {saving ? "Saving…" : "Save Letterhead"}
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
