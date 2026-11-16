"use client";

import { useMemo, useState, type CSSProperties } from "react";
import BackButton from "@/components/ui/BackButton";
import type { InvoiceFieldData, TemplateConfig } from "@/lib/pdf/generateFinalInvoice";
import { BUYER_CHARGES, type BuyerChargeKey } from "@/lib/buyer-charges";

type Doc = {
  id: string;
  doc_type: string;
  field_data: Record<string, any>;
  pdf_path: string | null;
  version: number;
  created_at: string;
};

type GoodsLine = { description: string; weight_kg: string; unit_price: string; amount: string };

type FormState = {
  invoice_date: string;
  terms: string;
  reference_no: string;
  ship_via: string;
  seal_number: string;
  goods_description: string;
  qty_bales: string;
  weight_lbs: string;
  weight_unit: string;
  supplier_name: string;
  items: GoodsLine[];
  charges: Record<BuyerChargeKey, string>;
};

// Charge inputs in the order of the owner's invoice.
const CHARGE_ORDER: BuyerChargeKey[] = ["trucking", "commission", "ocean_freight"];
const chargeLabel = (k: BuyerChargeKey) => BUYER_CHARGES.find((c) => c.key === k)!.label;

function num(v: string): number | null {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
// A goods line's amount: weight x rate when it has both, else the amount typed.
function lineAmount(l: GoodsLine): number {
  const w = num(l.weight_kg);
  const r = num(l.unit_price);
  if (w !== null && r !== null) return round2(w * r);
  return num(l.amount) ?? 0;
}
function plain(n: number) {
  return String(round2(n));
}
function dmy(iso: string) {
  const d = new Date(`${(iso || "").slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
}

export default function DocumentsClient({
  trackingId,
  defaults,
  hasBuyerInvoice,
  letterhead,
  buyerItems = [],
  allItems = [],
  existingDocs,
  backHref,
  backLabel,
}: {
  trackingId: string;
  defaults: InvoiceFieldData;
  hasBuyerInvoice: boolean;
  letterhead: TemplateConfig | null;
  // Goods descriptions (Items): this buyer's, and the company's whole list.
  buyerItems?: string[];
  allItems?: string[];
  existingDocs: Doc[];
  backHref: string;
  backLabel: string;
}) {
  const latest = existingDocs[0]?.field_data ?? {};
  const [docs, setDocs] = useState(existingDocs);
  const [form, setForm] = useState<FormState>(() => ({
    invoice_date: defaults.invoice_date,
    terms: latest.terms || defaults.terms,
    // Reference # is filled after examination / confirming with the client -
    // blank until then, remembered from the last version.
    reference_no: latest.reference_no || "",
    ship_via: defaults.ship_via,
    seal_number: defaults.seal_number,
    goods_description: defaults.goods_description || "",
    qty_bales: defaults.qty_bales,
    weight_lbs: defaults.weight_lbs,
    weight_unit: defaults.weight_unit || "LBS",
    supplier_name: defaults.supplier_name || "",
    items:
      (defaults.items ?? []).length > 0
        ? defaults.items!.map((it) => ({
            description: it.description ?? "",
            weight_kg: it.weight_kg != null ? String(it.weight_kg) : "",
            unit_price: it.unit_price != null ? String(it.unit_price) : "",
            amount: it.weight_kg != null && it.unit_price != null ? "" : String(it.amount ?? ""),
          }))
        : [{ description: defaults.description || "", weight_kg: defaults.weight_lbs || "", unit_price: "", amount: "" }],
    charges: {
      trucking: defaults.charges?.trucking ? String(defaults.charges.trucking) : "",
      commission: defaults.charges?.commission ? String(defaults.charges.commission) : "",
      ocean_freight: defaults.charges?.ocean_freight ? String(defaults.charges.ocean_freight) : "",
    },
  }));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const setLine = (i: number, patch: Partial<GoodsLine>) => setForm((f) => ({ ...f, items: f.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const goodsTotal = form.items.reduce((s, l) => s + lineAmount(l), 0);
  const chargesTotal = CHARGE_ORDER.reduce((s, k) => s + (num(form.charges[k]) ?? 0), 0);
  const grandTotal = round2(goodsTotal + chargesTotal);

  async function generate() {
    // Every goods line needs its description (an Item) - it prints on the
    // invoice and is what Profit & Loss groups goods by.
    const used = form.items.filter((l) => l.description.trim() || num(l.weight_kg) !== null || num(l.unit_price) !== null || num(l.amount) !== null);
    if (used.length === 0 || used.some((l) => !l.description.trim())) {
      setError("Choose a description for each goods line (or add a new one) before generating.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracking/${trackingId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Date, weight, goods lines and charges are saved to the Buyers
          // ledger row too; the rest is for this print.
          save_to_ledger: hasBuyerInvoice,
          overrides: {
            ...form,
            items: form.items.map((l) => ({ ...l, amount: num(l.weight_kg) !== null && num(l.unit_price) !== null ? "" : l.amount })),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      setDocs([json.document, ...docs]);
      setLastUrl(json.url);
      if (json.url) window.open(json.url, "_blank");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  const missingParty = !defaults.consignee_name;
  const currentVersion = docs[0]?.version;
  const unit = /^KG/i.test(form.weight_unit) ? "KG" : "LBS";

  const lockedFields: { label: string; value: string | null; mono?: boolean }[] = [
    { label: "Consignee", value: defaults.consignee_name },
    { label: "Invoice Number", value: defaults.invoice_no, mono: true },
    { label: "Booking Number", value: defaults.booking_number, mono: true },
    { label: "Container Number", value: defaults.container_number, mono: true },
  ];

  // The Description column as it will print (lib/pdf/generateFinalInvoice.ts).
  const previewLines = useMemo(() => {
    const out: { text: string; indent: boolean; rate?: string; amount?: string }[] = [];
    form.items.forEach((l, i) => {
      const amt = lineAmount(l);
      const lead = i === 0 && form.qty_bales ? `${form.qty_bales} Bales ` : "";
      const w = num(l.weight_kg) !== null ? `${l.weight_kg} ${unit}` : "";
      const text = `${lead}${l.description} ${w}`.replace(/\s+/g, " ").trim();
      if (text || amt) out.push({ text, indent: false, rate: l.unit_price || undefined, amount: amt ? plain(amt) : undefined });
    });
    for (const k of CHARGE_ORDER) {
      const a = num(form.charges[k]) ?? 0;
      if (a) out.push({ text: chargeLabel(k), indent: true, amount: plain(a) });
    }
    return out;
  }, [form, unit]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 flex-wrap">
        <BackButton href={backHref} label={backLabel} />
        <h1 className="text-xl font-semibold text-ink">Final Invoice</h1>
        {currentVersion != null && <span className="badge b-acc">v{currentVersion} current</span>}
      </div>
      <p className="sub -mt-3 max-w-[900px]">
        Everything is pre-filled from the booking, the BL, the container&apos;s packing and the Buyers ledger - change
        anything before printing. Each generation is a new version; nothing is overwritten.
      </p>

      <div className="flex flex-wrap gap-5 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-4" style={{ flexBasis: 560 }}>
          <section className="card flex flex-col gap-3.5" style={{ padding: "18px 20px" }} aria-labelledby="ro-h">
            <h2 id="ro-h" className="h2">Shipment</h2>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {lockedFields.map((l) => (
                <div className="field" key={l.label}>
                  <span className="text-[13px] font-medium text-ink">{l.label}</span>
                  <div className="flex items-center gap-2 h-10 px-3 border border-line rounded-[9px] bg-surface-2 text-ink text-sm" aria-readonly="true">
                    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--mut)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                    {l.value ? <span className={`truncate ${l.mono ? "mono" : ""}`}>{l.value}</span> : <span className="dash">—</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card flex flex-col gap-3.5" style={{ padding: "18px 20px" }} aria-labelledby="ed-h">
            <h2 id="ed-h" className="h2">Editable</h2>
            <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <Field id="df-date" label="Invoice / Ship Date">
                <input id="df-date" type="date" className="input" value={form.invoice_date} onChange={(e) => set({ invoice_date: e.target.value })} />
              </Field>
              <Field id="df-terms" label="Terms">
                <input id="df-terms" className="input" value={form.terms} onChange={(e) => set({ terms: e.target.value })} />
              </Field>
              <Field id="df-ref" label="Reference #">
                <input id="df-ref" className="input" value={form.reference_no} onChange={(e) => set({ reference_no: e.target.value })} />
              </Field>
              <Field id="df-via" label="Ship Via">
                <input id="df-via" className="input" value={form.ship_via} onChange={(e) => set({ ship_via: e.target.value })} />
              </Field>
              <Field id="df-seal" label="Seal #">
                <input id="df-seal" className="input mono" value={form.seal_number} onChange={(e) => set({ seal_number: e.target.value })} />
              </Field>
              <Field id="df-qty" label="Qty (Bales)">
                <input id="df-qty" className="input num" value={form.qty_bales} onChange={(e) => set({ qty_bales: e.target.value })} />
              </Field>
              <Field id="df-weight" label="Total Weight">
                <div className="flex gap-2">
                  <input id="df-weight" className="input num flex-1 min-w-0" value={form.weight_lbs} onChange={(e) => set({ weight_lbs: e.target.value })} />
                  <select aria-label="Weight unit" className="select" style={{ width: 80 }} value={unit} onChange={(e) => set({ weight_unit: e.target.value })}>
                    <option value="LBS">LBS</option>
                    <option value="KG">KG</option>
                  </select>
                </div>
              </Field>
              <div style={{ gridColumn: "1 / -1" }}>
                <Field id="df-desc" label="Goods description (heading)">
                  <input id="df-desc" className="input" value={form.goods_description} onChange={(e) => set({ goods_description: e.target.value })} />
                </Field>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-ink">Goods (rate × weight = amount) · description required</span>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted text-xs">
                    <th className="pb-1 pr-2 font-medium">Description</th>
                    <th className="pb-1 pr-2 font-medium w-28">Weight ({unit})</th>
                    <th className="pb-1 pr-2 font-medium w-24">Rate</th>
                    <th className="pb-1 pr-2 font-medium w-28 text-right">Amount</th>
                    <th className="pb-1 w-8"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((l, i) => {
                    const computed = num(l.weight_kg) !== null && num(l.unit_price) !== null;
                    return (
                      <tr key={i}>
                        <td className="pr-2 py-1">
                          <DescriptionPicker
                            value={l.description}
                            buyerItems={buyerItems}
                            allItems={allItems}
                            invalid={!!error && !l.description.trim()}
                            onChange={(v) => setLine(i, { description: v })}
                          />
                        </td>
                        <td className="pr-2 py-1"><input aria-label="Line weight" className="input num" value={l.weight_kg} onChange={(e) => setLine(i, { weight_kg: e.target.value })} /></td>
                        <td className="pr-2 py-1"><input aria-label="Line rate" className="input num" placeholder="0.15" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} /></td>
                        <td className="pr-2 py-1">
                          {computed ? (
                            <div className="h-10 px-3 flex items-center justify-end border border-line rounded-[9px] bg-surface-2 num" title="Weight × Rate">{plain(lineAmount(l))}</div>
                          ) : (
                            <input aria-label="Line amount" className="input num text-right" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
                          )}
                        </td>
                        <td className="py-1 text-center">
                          {form.items.length > 1 && (
                            <button onClick={() => set({ items: form.items.filter((_, j) => j !== i) })} aria-label="Remove line" className="text-muted hover:text-critical">✕</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button onClick={() => set({ items: [...form.items, { description: "", weight_kg: "", unit_price: "", amount: "" }] })} className="text-xs text-accent hover:underline self-start">
                + Add goods line
              </button>
            </div>

            <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              {CHARGE_ORDER.map((k) => (
                <Field key={k} id={`df-${k}`} label={chargeLabel(k)} help="0 or blank = not printed">
                  <input
                    id={`df-${k}`}
                    className="input num"
                    inputMode="decimal"
                    value={form.charges[k]}
                    onChange={(e) => set({ charges: { ...form.charges, [k]: e.target.value } })}
                  />
                </Field>
              ))}
              <div style={{ gridColumn: "1 / -1" }}>
                <Field id="df-sup" label="Supplier (printed just below the lines)">
                  <input id="df-sup" className="input" value={form.supplier_name} onChange={(e) => set({ supplier_name: e.target.value })} />
                </Field>
              </div>
            </div>

            <div className="flex justify-end gap-6 text-sm border-t border-line pt-3">
              <span className="text-muted">Goods <b className="text-ink num">${plain(goodsTotal)}</b></span>
              <span className="text-muted">Charges <b className="text-ink num">${plain(chargesTotal)}</b></span>
              <span className="text-muted">Cost of Goods <b className="text-ink num">${plain(grandTotal)}</b></span>
            </div>

            {hasBuyerInvoice && (
              <p className="help">Date, weight, goods lines and Trucking / Commission / Ocean Freight are also saved to this invoice on the Buyers ledger.</p>
            )}
            {error && <p className="err">{error}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-line">
              {lastUrl ? (
                <a href={lastUrl} target="_blank" rel="noreferrer" className="text-sm font-medium">Open the PDF just generated →</a>
              ) : (
                <span />
              )}
              <button onClick={generate} disabled={generating || missingParty} className="btn btn-p">
                {generating ? "Generating…" : docs.length > 0 ? "Regenerate (new version)" : "Generate Invoice PDF"}
              </button>
            </div>
          </section>

          <section className="card" style={{ padding: "18px 20px" }} aria-labelledby="vh-h">
            <h2 id="vh-h" className="h2" style={{ marginBottom: 8 }}>Version history</h2>
            {docs.length === 0 ? (
              <p className="lbl" style={{ padding: "24px 0", textAlign: "center" }}>No versions generated yet.</p>
            ) : (
              docs.map((d, i) => <VersionRow key={d.id} doc={d} isCurrent={i === 0} />)
            )}
          </section>

          {missingParty && (
            <div className="banner bn-warn text-[13px]" role="note">
              This shipment has no buyer assigned yet. Assign one in Booking &amp; Instructions before generating.
            </div>
          )}
        </div>

        {/* Live preview: the invoice's own layout, from the form above. */}
        <aside className="card bg-surface-2 flex flex-col gap-3" style={{ flex: "1 1 460px", minWidth: 0, padding: 16 }} aria-label="Live invoice preview">
          <div className="flex justify-between items-center">
            <span className="h2">Live preview</span>
            <span className="meta">updates as you type</span>
          </div>
          <div style={{ background: "#fff", color: "#111", padding: "22px 20px", borderRadius: 4, boxShadow: "0 2px 10px rgba(15,23,42,0.12)", fontFamily: "Arial, sans-serif", fontSize: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontFamily: "'Times New Roman', serif" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{(letterhead?.company_name || "[Company name]").toUpperCase()}</div>
                {(letterhead?.address_lines ?? []).slice(0, 2).map((l, i) => (
                  <div key={i} style={{ fontSize: 10, fontWeight: 700 }}>{l.toUpperCase()}</div>
                ))}
                <div style={{ fontSize: 10 }}>{[letterhead?.phone && `VOICE: ${letterhead.phone}`, letterhead?.fax && `FAX: ${letterhead.fax}`].filter(Boolean).join(" - ")}</div>
                {letterhead?.email && <div style={{ fontSize: 10, fontStyle: "italic" }}>E-mail: {letterhead.email}</div>}
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Times New Roman', serif", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>INVOICE</div>
                <table style={tbl}>
                  <tbody>
                    <tr><th style={th}>Date</th><th style={th}>Invoice #</th></tr>
                    <tr><td style={tdC}>{dmy(form.invoice_date)}</td><td style={tdC}>{defaults.invoice_no || "—"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ display: "flex", gap: 24, margin: "12px 0" }}>
              {["CONSIGNEE:", "NOTIFY PARTY:"].map((h) => (
                <div key={h} style={{ flex: 1, border: "1px solid #000" }}>
                  <div style={{ fontWeight: 700, borderBottom: "1px solid #000", padding: "2px 3px" }}>{h}</div>
                  <div style={{ padding: "3px 8px", fontFamily: "'Times New Roman', serif", whiteSpace: "pre-line", minHeight: 44 }}>
                    {defaults.consignee_name}
                    {defaults.consignee_address ? `\n${defaults.consignee_address}` : ""}
                  </div>
                </div>
              ))}
            </div>
            <table style={{ ...tbl, width: "100%" }}>
              <tbody>
                <tr>{["Booking #", "Container #", "Terms", "Ship Date", "Ship Via", "Seal #", "Reference #"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                <tr>
                  {[defaults.booking_number, defaults.container_number, form.terms, dmy(form.invoice_date), form.ship_via, form.seal_number, form.reference_no].map((v, i) => (
                    <td key={i} style={tdC}>{v || ""}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <table style={{ ...tbl, width: "100%", borderTop: 0 }}>
              <tbody>
                <tr>
                  <th style={{ ...th, width: "12%" }}>Weight</th>
                  <th style={{ ...th, width: "12%" }}>Qty/Units</th>
                  <th style={th}>Description</th>
                  <th style={{ ...th, width: "11%" }}>Rate</th>
                  <th style={{ ...th, width: "12%" }}>Amount</th>
                </tr>
                <tr style={{ verticalAlign: "top" }}>
                  <td style={{ ...tdC, height: 210 }}>{form.weight_lbs ? `${form.weight_lbs} ${unit}` : ""}</td>
                  <td style={tdC}>{form.qty_bales ? `${form.qty_bales} BALES` : ""}</td>
                  <td style={td}>
                    <div style={{ fontFamily: "'Times New Roman', serif", marginBottom: 8 }}>{form.goods_description}</div>
                    {previewLines.map((l, i) => (
                      <div key={i} style={{ paddingLeft: l.indent ? 5 : 0, lineHeight: 1.6 }}>{l.text}</div>
                    ))}
                    {form.supplier_name && <div style={{ marginTop: 6 }}>{form.supplier_name}</div>}
                    <div style={{ marginTop: 40 }}>{form.weight_lbs ? `TOTAL WEIGHT ${form.weight_lbs} ${unit}` : ""}</div>
                    <div style={{ marginTop: 12, fontFamily: "'Times New Roman', serif", fontSize: 8 }}>TOTAL AMOUNT CIF MUNDRA PORT</div>
                  </td>
                  <td style={{ ...tdC, paddingTop: 22 }}>
                    {previewLines.map((l, i) => <div key={i} style={{ lineHeight: 1.6 }}>{l.rate || " "}</div>)}
                  </td>
                  <td style={{ ...td, textAlign: "right", paddingTop: 22 }}>
                    {previewLines.map((l, i) => <div key={i} style={{ lineHeight: 1.6 }}>{l.amount ? `$ ${l.amount}` : " "}</div>)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", border: "1px solid #000", borderTop: 0 }}>
              <div style={{ padding: 4, fontFamily: "'Times New Roman', serif", fontSize: 8 }}>
                We hereby certify that the invoice is true &amp; correct.
                <div style={{ fontFamily: "Arial", fontSize: 9, marginTop: 8 }}>{(letterhead?.company_name || "").toUpperCase()}</div>
                <div style={{ fontFamily: "Arial", fontSize: 9, textDecoration: "underline" }}>By: {(defaults.signed_by || "").toUpperCase()}</div>
              </div>
              <table style={{ ...tbl, alignSelf: "stretch" }}>
                <tbody>
                  <tr><th style={{ ...th, textAlign: "left" }}>Cost of Goods</th><td style={{ ...tdC, fontWeight: 700 }}>{grandTotal ? `$ ${plain(grandTotal)}` : ""}</td></tr>
                  <tr><th style={{ ...th, textAlign: "left" }}>Payments/Credits</th><td style={td}>$</td></tr>
                  <tr><th style={{ ...th, textAlign: "left" }}>Balance Due</th><td style={{ ...tdC, fontWeight: 700 }}>{grandTotal ? `$ ${plain(grandTotal)}` : ""}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  );
}

const tbl: CSSProperties = { borderCollapse: "collapse", border: "1px solid #000" };
const th: CSSProperties = { border: "1px solid #000", padding: "3px 4px", fontWeight: 700, textAlign: "center", fontSize: 9 };
const td: CSSProperties = { border: "1px solid #000", padding: "3px 4px", fontSize: 9 };
const tdC: CSSProperties = { ...td, textAlign: "center" };

function VersionRow({ doc, isCurrent }: { doc: Doc; isCurrent: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function getSignedUrl() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/signed-url`);
      const json = await res.json();
      if (res.ok) setUrl(json.url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line" style={{ padding: "11px 0" }}>
      <span className={`badge ${isCurrent ? "b-acc" : "b-neu"}`} style={{ minWidth: 40 }}>v{doc.version}</span>
      <span className="num" style={{ flex: "1 1 200px" }}>
        {new Date(doc.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
      </span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-xs">Open PDF</a>
      ) : (
        <button onClick={getSignedUrl} disabled={loading} className="btn btn-xs">
          {loading ? "Loading…" : "Get link"}
        </button>
      )}
    </div>
  );
}

// The goods line's description: a dropdown of this buyer's Items, then the
// company's other Items, or "+ Add new description" (saved as a new Item and
// assigned to this buyer when the invoice is generated).
function DescriptionPicker({
  value,
  buyerItems,
  allItems,
  invalid,
  onChange,
}: {
  value: string;
  buyerItems: string[];
  allItems: string[];
  invalid: boolean;
  onChange: (v: string) => void;
}) {
  const known = (v: string) => [...buyerItems, ...allItems].some((n) => n.toLowerCase() === v.trim().toLowerCase());
  const [adding, setAdding] = useState(!!value && !known(value));
  const others = allItems.filter((n) => !buyerItems.some((b) => b.toLowerCase() === n.toLowerCase()));
  const cls = `input ${invalid ? "border-critical" : ""}`;

  if (adding) {
    return (
      <div className="flex gap-1">
        <input autoFocus aria-label="New description" className={`${cls} flex-1 min-w-0`} placeholder="New description, e.g. Cream Rags" value={value} onChange={(e) => onChange(e.target.value)} />
        <button
          type="button"
          onClick={() => {
            setAdding(false);
            onChange("");
          }}
          aria-label="Back to the list"
          className="text-muted hover:text-ink px-1"
        >
          ✕
        </button>
      </div>
    );
  }
  const selected = [...buyerItems, ...others].find((n) => n.toLowerCase() === value.trim().toLowerCase()) ?? "";
  return (
    <select
      aria-label="Line description"
      className={`select ${invalid ? "border-critical" : ""}`}
      style={{ width: "100%" }}
      value={selected}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setAdding(true);
          onChange("");
        } else onChange(e.target.value);
      }}
    >
      <option value="">Select description…</option>
      {buyerItems.length > 0 && (
        <optgroup label="This buyer's goods">
          {buyerItems.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label="Other items">
          {others.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </optgroup>
      )}
      <option value="__new__">+ Add new description…</option>
    </select>
  );
}
