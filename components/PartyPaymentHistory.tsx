"use client";

import { useEffect, useState } from "react";
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
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Shared by Forwarders/Suppliers/Truckers' invoice ledgers - a running
// log of actual payments made to this party, separate from the existing
// per-invoice PAID/UNPAID toggle (which stays exactly as it is,
// manually adjustable). "Net still owed" is deliberately always an
// all-time balance, never year-scoped - a current balance shouldn't
// change just because the app-wide Year selector moved. Each payment's
// own applies_to_year (asked explicitly on entry, defaulting to the
// Year selector) is what P&L's year-wise view reads instead.
export default function PartyPaymentHistory({
  partyId,
  totalInvoicedUsd,
}: {
  partyId: string;
  totalInvoicedUsd: number;
}) {
  const { year } = useYear();
  const [expanded, setExpanded] = useState(false);
  const [payments, setPayments] = useState<Payment[] | null>(null);
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

  useEffect(() => {
    if (expanded && payments === null) {
      fetch(`/api/party-payments?party_id=${partyId}`)
        .then((r) => r.json())
        .then((json) => setPayments(json.payments ?? []))
        .catch(() => setPayments([]));
    }
  }, [expanded, payments, partyId]);

  const totalPaidUsd = (payments ?? []).reduce((s, p) => s + p.amount * (p.fx_rate || 1), 0);
  const netOwedUsd = totalInvoicedUsd - totalPaidUsd;

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
      .then((json) => setPayments(json.payments ?? []))
      .catch(() => {});
  }

  return (
    <section className="bg-surface border border-line rounded-xl shadow-sm mb-4" aria-labelledby="payment-history-heading">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h2 id="payment-history-heading" className="text-base font-semibold text-ink">Payment History</h2>
          <p className="text-xs text-muted mt-0.5">Payments made to this party, counted against the invoiced total</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="payment-history-body"
          className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium shrink-0"
        >
          {expanded ? "Hide ▲" : "Show ▼"}
        </button>
      </div>

      {expanded && (
        <div id="payment-history-body" className="px-4 pb-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-surface-2 border border-line rounded-lg p-3.5">
              <div className="text-xs text-muted">Total Invoiced (USD)</div>
              <div className="text-lg font-semibold text-ink mt-1 tabular-nums">{fmtMoney(totalInvoicedUsd, "USD")}</div>
            </div>
            <div className="bg-surface-2 border border-line rounded-lg p-3.5">
              <div className="text-xs text-muted">Total Paid (USD)</div>
              <div className="text-lg font-semibold text-success mt-1 tabular-nums">{fmtMoney(totalPaidUsd, "USD")}</div>
            </div>
            <div className={`rounded-lg p-3.5 border ${netOwedUsd > 0 ? "bg-warning-soft border-ai-border" : "bg-success-soft border-success"}`}>
              <div className="text-xs text-muted">Net Still Owed (USD)</div>
              <div className={`text-lg font-semibold mt-1 tabular-nums ${netOwedUsd > 0 ? "text-warning" : "text-success"}`}>{fmtMoney(netOwedUsd, "USD")}</div>
            </div>
          </div>

          {payments === null ? (
            <div className="text-sm text-muted">Loading…</div>
          ) : (
            <div className="max-h-[30vh] overflow-y-auto border border-line rounded-lg">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-surface z-10">
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-1.5 pr-2 pl-2 font-medium text-xs">Date</th>
                  <th className="py-1.5 pr-2 font-medium text-xs text-right">Amount</th>
                  <th className="py-1.5 pr-2 font-medium text-xs">Applies to Year</th>
                  <th className="py-1.5 pr-2 font-medium text-xs">Note</th>
                  <th className="py-1.5 w-8"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-line">
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
            </div>
          )}

          {adding ? (
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
          ) : (
            <div className="flex gap-2 self-start">
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
