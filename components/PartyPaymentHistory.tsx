"use client";

import { useEffect, useRef, useState } from "react";
import { useYear } from "@/lib/year-context";
import PartyPaymentImportModal from "@/components/PartyPaymentImportModal";

type Payment = {
  id: string;
  amount: number;
  currency: string;
  fx_rate: number;
  paid_on: string;
  applies_to_year: number;
  note: string | null;
};

const CURRENCIES = ["USD", "INR", "EUR", "GBP", "AED"];

function fmtMoney(n: number, currency: string) {
  const amount = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "USD" ? `$${amount}` : `${currency} ${amount}`;
}

// Shared by Forwarders/Suppliers/Truckers' invoice ledgers - a running
// log of actual payments made to this party, separate from the existing
// per-invoice PAID/UNPAID toggle (which stays exactly as it is,
// manually adjustable). Scoped to the sidebar's Working Year like the rest
// of the app: only payments whose own applies_to_year (asked explicitly on
// entry, defaulting to the Working Year) is that year are listed, and
// "Net still owed" is that year's invoiced total (the ledger passes it in,
// year-scoped) minus that year's payments - the same split P&L uses.
//
// variant "drawer" (Forwarder ledger, lib/ui-flags.ts PAYMENTS_LAYOUT): the
// same Payment History - totals, history, Add Payment, Import Excel - in a
// side panel opened from the ledger's "Payments & History" button, so the
// ledger table keeps the page's height. "card" (default) is the inline card.
export default function PartyPaymentHistory({
  partyId,
  totalInvoicedUsd,
  variant = "card",
  open = false,
  onClose,
  partyName,
}: {
  partyId: string;
  totalInvoicedUsd: number;
  variant?: "card" | "drawer";
  open?: boolean;
  onClose?: () => void;
  partyName?: string;
}) {
  const isDrawer = variant === "drawer";
  const { year } = useYear();
  const [expanded, setExpanded] = useState(false);
  const [allPayments, setPayments] = useState<Payment[] | null>(null);
  const payments = allPayments === null ? null : allPayments.filter((p) => Number(p.applies_to_year) === year);
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    amount: "",
    currency: "USD",
    fx_rate: "1",
    paid_on: new Date().toISOString().slice(0, 10),
    applies_to_year: String(year),
    note: "",
  });

  const isOpen = isDrawer ? open : expanded;
  useEffect(() => {
    if (isOpen && allPayments === null) {
      fetch(`/api/party-payments?party_id=${partyId}`)
        .then((r) => r.json())
        .then((json) => setPayments(json.payments ?? []))
        .catch(() => setPayments([]));
    }
  }, [isOpen, allPayments, partyId]);

  // Drawer: Escape closes it, and focus starts on its close button.
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isDrawer || !open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !importing) onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isDrawer, open, importing, onClose]);

  // New payments default to whichever year is being looked at.
  useEffect(() => {
    setForm((f) => ({ ...f, applies_to_year: String(year) }));
    setPage(0);
  }, [year]);

  const totalPaidUsd = (payments ?? []).reduce((s, p) => s + p.amount * (p.fx_rate || 1), 0);
  const netOwedUsd = totalInvoicedUsd - totalPaidUsd;

  // Paged so Previous / Next always stays in view (5 fit the side panel).
  const PAGE_SIZE = isDrawer ? 5 : 3;
  const pageCount = Math.max(1, Math.ceil((payments ?? []).length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const paginatedPayments = (payments ?? []).slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  async function addPayment() {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/party-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          party_id: partyId,
          amount,
          currency: form.currency,
          fx_rate: Number(form.fx_rate) || 1,
          paid_on: form.paid_on,
          applies_to_year: Number(form.applies_to_year) || year,
          note: form.note || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add payment");
      setPayments((prev) => [json.payment, ...(prev ?? [])]);
      setPage(0);
      setForm({ amount: "", currency: "USD", fx_rate: "1", paid_on: new Date().toISOString().slice(0, 10), applies_to_year: String(year), note: "" });
      setAdding(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removePayment(id: string) {
    if (!confirm("Remove this payment? This cannot be undone.")) return;
    const res = await fetch(`/api/party-payments/${id}`, { method: "DELETE" });
    if (res.ok) setPayments((prev) => (prev ?? []).filter((p) => p.id !== id));
  }

  function refreshPayments() {
    fetch(`/api/party-payments?party_id=${partyId}`)
      .then((r) => r.json())
      .then((json) => {
        setPayments(json.payments ?? []);
        setPage(0);
      })
      .catch(() => {});
  }

  const actionButtons = (
    <>
      <button
        onClick={() => setAdding(true)}
        className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium"
      >
        + Add Payment
      </button>
      <button
        onClick={() => setImporting(true)}
        className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium"
      >
        ↥ Import Excel
      </button>
    </>
  );

  if (isDrawer) {
    if (!open) return null;
    return (
      <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={() => onClose?.()} aria-hidden="true" />
        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="payments-drawer-title"
          className="fixed right-0 top-0 bottom-0 z-[45] bg-surface border-l border-line shadow-2xl flex flex-col"
          style={{ width: "min(560px, 100vw)", whiteSpace: "normal" }}
        >
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
            <div>
              <h2 id="payments-drawer-title" className="text-lg font-semibold text-ink">Payments &amp; History</h2>
              <p className="text-xs text-muted mt-0.5">
                {partyName ? `${partyName} · ` : ""}payments for {year}, counted against {year}&apos;s invoiced total
              </p>
            </div>
            <button
              ref={closeRef}
              onClick={() => onClose?.()}
              aria-label="Close payments panel"
              className="w-9 h-9 shrink-0 inline-flex items-center justify-center border border-line rounded-lg text-muted hover:text-ink hover:bg-surface-2"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-2 border border-line rounded-lg p-3.5">
              <div className="text-xs text-muted">Total Invoiced {year} (USD)</div>
              <div className="text-lg font-semibold text-ink mt-1 tabular-nums">{fmtMoney(totalInvoicedUsd, "USD")}</div>
            </div>
            <div className="bg-surface-2 border border-line rounded-lg p-3.5">
              <div className="text-xs text-muted">Total Paid {year} (USD)</div>
              <div className="text-lg font-semibold text-success mt-1 tabular-nums">{fmtMoney(totalPaidUsd, "USD")}</div>
            </div>
            <div className={`col-span-2 rounded-lg p-3.5 border ${netOwedUsd > 0 ? "bg-warning-soft border-ai-border" : "bg-success-soft border-success"}`}>
              <div className="text-xs text-muted">Net Still Owed {year} (USD)</div>
              <div className={`text-lg font-semibold mt-1 tabular-nums ${netOwedUsd > 0 ? "text-warning" : "text-success"}`}>{fmtMoney(netOwedUsd, "USD")}</div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Payment history</h3>
            <div className="flex items-center gap-2">{actionButtons}</div>
          </div>
          {payments === null ? (
            <div className="text-sm text-muted">Loading…</div>
          ) : (
            <div className="border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-muted border-b border-line bg-surface">
                  <th className="py-1.5 pr-2 pl-2 font-medium text-xs">Date</th>
                  <th className="py-1.5 pr-2 font-medium text-xs text-right">Amount</th>
                  <th className="py-1.5 pr-2 font-medium text-xs">Applies to Year</th>
                  <th className="py-1.5 pr-2 font-medium text-xs">Note</th>
                  <th className="py-1.5 w-8"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {paginatedPayments.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <td className="py-2 pr-2 pl-2 tabular-nums">{new Date(p.paid_on).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(p.amount, p.currency)}</td>
                    <td className="py-2 pr-2">{p.applies_to_year}</td>
                    <td className="py-2 pr-2 text-text-2">{p.note || <span className="text-muted">—</span>}</td>
                    <td className="py-2 text-center">
                      <button
                        onClick={() => removePayment(p.id)}
                        aria-label="Remove payment"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-critical hover:bg-critical-soft"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr><td colSpan={5} className="py-3 text-muted text-xs">No payments recorded yet.</td></tr>
                )}
              </tbody>
            </table>
            {payments.length > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-line bg-surface">
                <span className="text-xs text-muted tabular-nums">
                  Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, payments.length)} of {payments.length}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="text-xs border border-line bg-surface hover:bg-surface-2 rounded-lg px-2.5 py-1 font-medium disabled:opacity-50">
                    Previous
                  </button>
                  <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} className="text-xs border border-line bg-surface hover:bg-surface-2 rounded-lg px-2.5 py-1 font-medium disabled:opacity-50">
                    Next
                  </button>
                </div>
              </div>
            )}
            </div>
          )}

          {adding && (
            <div className="border border-accent rounded-lg p-4 flex flex-col gap-3">
              <span className="text-sm font-semibold text-ink">+ Add Payment</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pp-amount" className="text-xs font-medium text-ink">Amount</label>
                  <input
                    id="pp-amount"
                    placeholder="Amount"
                    type="number"
                    className={`border rounded-lg px-2 py-1.5 text-sm bg-surface tabular-nums ${error ? "border-critical" : "border-line"}`}
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                  {error && <span className="text-xs text-critical font-medium">{error}</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pp-currency" className="text-xs font-medium text-ink">Currency</label>
                  <select
                    id="pp-currency"
                    className="border border-line rounded-lg px-2 py-1.5 text-sm bg-surface"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {form.currency !== "USD" && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="pp-fx" className="text-xs font-medium text-ink">FX rate to USD</label>
                    <input
                      id="pp-fx"
                      placeholder="FX rate to USD"
                      type="number"
                      className="border border-line rounded-lg px-2 py-1.5 text-sm bg-surface tabular-nums"
                      value={form.fx_rate}
                      onChange={(e) => setForm({ ...form, fx_rate: e.target.value })}
                    />
                    <span className="text-xs text-muted">Shown for non-USD</span>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pp-date" className="text-xs font-medium text-ink">Date</label>
                  <input
                    id="pp-date"
                    type="date"
                    className="border border-line rounded-lg px-2 py-1.5 text-sm bg-surface"
                    value={form.paid_on}
                    onChange={(e) => setForm({ ...form, paid_on: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pp-year" className="text-xs font-medium text-ink">Applies to year</label>
                  <input
                    id="pp-year"
                    type="number"
                    className="border border-line rounded-lg px-2 py-1.5 text-sm bg-surface tabular-nums"
                    value={form.applies_to_year}
                    onChange={(e) => setForm({ ...form, applies_to_year: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pp-note" className="text-xs font-medium text-ink">Note (optional)</label>
                  <input
                    id="pp-note"
                    placeholder="e.g. Wire ref"
                    className="border border-line rounded-lg px-2 py-1.5 text-sm bg-surface"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setAdding(false); setError(null); }}
                  className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={addPayment}
                  disabled={saving}
                  className="text-sm bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 font-medium disabled:opacity-60"
                >
                  {saving ? "…" : "Save"}
                </button>
              </div>
            </div>
          )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-line bg-surface-2">
            <button onClick={() => onClose?.()} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium">
              Close
            </button>
          </div>
        </aside>
        {importing && <PartyPaymentImportModal partyId={partyId} onClose={() => setImporting(false)} onImported={refreshPayments} />}
      </>
    );
  }

  return (
    <section className="bg-surface border border-line rounded-xl shadow-sm mb-4" aria-labelledby="payment-history-heading">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h2 id="payment-history-heading" className="text-base font-semibold text-ink">Payment History</h2>
          <p className="text-xs text-muted mt-0.5">Payments made to this party for {year}, counted against {year}&apos;s invoiced total</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expanded && actionButtons}
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls="payment-history-body"
            className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium"
          >
            {expanded ? "Hide ▲" : "Show ▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div id="payment-history-body" className="px-4 pb-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-surface-2 border border-line rounded-lg p-3.5">
              <div className="text-xs text-muted">Total Invoiced {year} (USD)</div>
              <div className="text-lg font-semibold text-ink mt-1 tabular-nums">{fmtMoney(totalInvoicedUsd, "USD")}</div>
            </div>
            <div className="bg-surface-2 border border-line rounded-lg p-3.5">
              <div className="text-xs text-muted">Total Paid {year} (USD)</div>
              <div className="text-lg font-semibold text-success mt-1 tabular-nums">{fmtMoney(totalPaidUsd, "USD")}</div>
            </div>
            <div className={`rounded-lg p-3.5 border ${netOwedUsd > 0 ? "bg-warning-soft border-ai-border" : "bg-success-soft border-success"}`}>
              <div className="text-xs text-muted">Net Still Owed {year} (USD)</div>
              <div className={`text-lg font-semibold mt-1 tabular-nums ${netOwedUsd > 0 ? "text-warning" : "text-success"}`}>{fmtMoney(netOwedUsd, "USD")}</div>
            </div>
          </div>

          {payments === null ? (
            <div className="text-sm text-muted">Loading…</div>
          ) : (
            <div className="border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-muted border-b border-line bg-surface">
                  <th className="py-1.5 pr-2 pl-2 font-medium text-xs">Date</th>
                  <th className="py-1.5 pr-2 font-medium text-xs text-right">Amount</th>
                  <th className="py-1.5 pr-2 font-medium text-xs">Applies to Year</th>
                  <th className="py-1.5 pr-2 font-medium text-xs">Note</th>
                  <th className="py-1.5 w-8"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {paginatedPayments.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <td className="py-2 pr-2 pl-2 tabular-nums">{new Date(p.paid_on).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(p.amount, p.currency)}</td>
                    <td className="py-2 pr-2">{p.applies_to_year}</td>
                    <td className="py-2 pr-2 text-text-2">{p.note || <span className="text-muted">—</span>}</td>
                    <td className="py-2 text-center">
                      <button
                        onClick={() => removePayment(p.id)}
                        aria-label="Remove payment"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-critical hover:bg-critical-soft"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr><td colSpan={5} className="py-3 text-muted text-xs">No payments recorded yet.</td></tr>
                )}
              </tbody>
            </table>
            {payments.length > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-line bg-surface">
                <span className="text-xs text-muted tabular-nums">
                  Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, payments.length)} of {payments.length}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="text-xs border border-line bg-surface hover:bg-surface-2 rounded-lg px-2.5 py-1 font-medium disabled:opacity-50">
                    Previous
                  </button>
                  <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} className="text-xs border border-line bg-surface hover:bg-surface-2 rounded-lg px-2.5 py-1 font-medium disabled:opacity-50">
                    Next
                  </button>
                </div>
              </div>
            )}
            </div>
          )}

          {adding && (
            <div className="border border-accent rounded-lg p-4 flex flex-col gap-3">
              <span className="text-sm font-semibold text-ink">+ Add Payment</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pp-amount" className="text-xs font-medium text-ink">Amount</label>
                  <input
                    id="pp-amount"
                    placeholder="Amount"
                    type="number"
                    className={`border rounded-lg px-2 py-1.5 text-sm bg-surface tabular-nums ${error ? "border-critical" : "border-line"}`}
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                  {error && <span className="text-xs text-critical font-medium">{error}</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pp-currency" className="text-xs font-medium text-ink">Currency</label>
                  <select
                    id="pp-currency"
                    className="border border-line rounded-lg px-2 py-1.5 text-sm bg-surface"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {form.currency !== "USD" && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="pp-fx" className="text-xs font-medium text-ink">FX rate to USD</label>
                    <input
                      id="pp-fx"
                      placeholder="FX rate to USD"
                      type="number"
                      className="border border-line rounded-lg px-2 py-1.5 text-sm bg-surface tabular-nums"
                      value={form.fx_rate}
                      onChange={(e) => setForm({ ...form, fx_rate: e.target.value })}
                    />
                    <span className="text-xs text-muted">Shown for non-USD</span>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pp-date" className="text-xs font-medium text-ink">Date</label>
                  <input
                    id="pp-date"
                    type="date"
                    className="border border-line rounded-lg px-2 py-1.5 text-sm bg-surface"
                    value={form.paid_on}
                    onChange={(e) => setForm({ ...form, paid_on: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pp-year" className="text-xs font-medium text-ink">Applies to year</label>
                  <input
                    id="pp-year"
                    type="number"
                    className="border border-line rounded-lg px-2 py-1.5 text-sm bg-surface tabular-nums"
                    value={form.applies_to_year}
                    onChange={(e) => setForm({ ...form, applies_to_year: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pp-note" className="text-xs font-medium text-ink">Note (optional)</label>
                  <input
                    id="pp-note"
                    placeholder="e.g. Wire ref"
                    className="border border-line rounded-lg px-2 py-1.5 text-sm bg-surface"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setAdding(false); setError(null); }}
                  className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={addPayment}
                  disabled={saving}
                  className="text-sm bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 font-medium disabled:opacity-60"
                >
                  {saving ? "…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {importing && (
        <PartyPaymentImportModal
          partyId={partyId}
          onClose={() => setImporting(false)}
          onImported={refreshPayments}
        />
      )}
    </section>
  );
}
