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

  const previewAddressLines = addressLines.split("\n").filter(Boolean);

  return (
    <section id="lh" className="card" aria-labelledby="lh-t">
      <div className="ch">
        <span className="cico" aria-hidden="true">
          <FileText size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 id="lh-t" className="h2">Document Letterhead</h2>
          <div className="lbl mt-0.5">Company identity used on final invoices and booking instructions.</div>
        </div>
        {isAdmin ? (
          !open && (
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
          )
        ) : (
          <span className="badge b-neu">Admins only</span>
        )}
      </div>

      <div className="sdet">
        <div className="sfield">
          <span>Company name</span>
          <strong className={config?.company_name ? "" : "dash"}>{config?.company_name || "Not set up yet"}</strong>
        </div>
        <div className="sfield">
          <span>Applied to</span>
          <strong>Final Invoice · Booking Instructions</strong>
        </div>
      </div>

      {(success || open) && (
      <div className="cb">
        {success && (
          <span role="status" className="meta" style={{ color: "var(--ok)", fontWeight: 600 }}>
            Letterhead updated.
          </span>
        )}

        {open && (
          <div className="flex flex-wrap gap-6 items-start">
            <div className="flex-1 flex flex-col gap-3.5 min-w-0" style={{ flexBasis: 360 }}>
              <div className="field">
                <label htmlFor="lc">Company name</label>
                <input id="lc" className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="la">Address (one line per row)</label>
                <textarea
                  id="la"
                  className="textarea"
                  rows={3}
                  value={addressLines}
                  onChange={(e) => setAddressLines(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="field">
                  <label htmlFor="lp">Phone</label>
                  <input id="lp" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="lf">Fax</label>
                  <input id="lf" className="input" placeholder="Optional" value={fax} onChange={(e) => setFax(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="le">Email</label>
                  <input id="le" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="lcol">Accent color</label>
                <div className="flex items-center gap-2.5">
                  <input
                    id="lcol"
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{ width: 44, height: 40, padding: 2, border: "1px solid var(--line2)", borderRadius: 9, background: "var(--surf)" }}
                  />
                  <input
                    className="input mono"
                    aria-label="Accent color hex"
                    style={{ maxWidth: 140 }}
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="lsd">Shipper declares clause</label>
                <textarea
                  id="lsd"
                  className="textarea"
                  rows={3}
                  value={shipperDeclaration}
                  onChange={(e) => setShipperDeclaration(e.target.value)}
                />
                <span className="help">
                  Use{" "}
                  <span className="mono" style={{ background: "var(--accentS)", color: "var(--accent)", padding: "1px 6px", borderRadius: 4 }}>
                    {"{destination}"}
                  </span>{" "}
                  where the port of delivery should be inserted.
                </span>
              </div>

              {error && <span className="err">{error}</span>}

              <div className="flex gap-2.5 items-center">
                <button type="button" className="btn btn-p" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save Letterhead"}
                </button>
                <button type="button" className="btn btn-g" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 min-w-[260px]" style={{ flex: "0 1 320px" }}>
              <span className="lbl font-semibold text-ink">Live preview</span>
              <div
                aria-label="Letterhead preview"
                role="img"
                className="card"
                style={{
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  fontSize: 10,
                  aspectRatio: "8.5 / 11",
                }}
              >
                <div style={{ borderTop: `4px solid ${accentColor}`, paddingTop: 10, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: accentColor }}>{companyName || "Company name"}</div>
                    <div className="text-text-2" style={{ lineHeight: 1.4 }}>
                      {previewAddressLines.length > 0 ? (
                        previewAddressLines.map((line, i) => (
                          <span key={i}>
                            {line}
                            <br />
                          </span>
                        ))
                      ) : (
                        <span className="dash">—</span>
                      )}
                    </div>
                  </div>
                  <div className="text-text-2" style={{ textAlign: "right", lineHeight: 1.4 }}>
                    {phone}
                    {phone && email ? <br /> : null}
                    {email}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", marginTop: 8 }}>INVOICE</div>
                <div className="bg-line" style={{ height: 6, borderRadius: 3, width: "80%" }} />
                <div className="bg-line" style={{ height: 6, borderRadius: 3, width: "60%" }} />
                <div className="bg-line" style={{ height: 6, borderRadius: 3, width: "70%" }} />
                <div style={{ flex: 1 }} />
                <div className="text-text-2" style={{ fontStyle: "italic" }}>
                  {shipperDeclaration || <span className="dash">—</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </section>
  );
}
