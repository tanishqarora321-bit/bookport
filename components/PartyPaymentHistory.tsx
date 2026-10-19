"use client";

import { useEffect, useState } from "react";
import { useYear } from "@/lib/year-context";

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

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Payment History</h2>
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-accent underline">
          {expanded ? "Hide ▲" : "Show ▼"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-ink/40">Total Invoiced (USD)</div>
              <div className="text-lg font-semibold text-ink">{fmtMoney(totalInvoicedUsd, "USD")}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-ink/40">Total Paid (USD)</div>
              <div className="text-lg font-semibold text-ink">{fmtMoney(totalPaidUsd, "USD")}</div>
            </div>
            <div className={`rounded-lg p-3 ${netOwedUsd > 0 ? "bg-amber-50" : "bg-emerald-50"}`}>
              <div className="text-xs text-ink/40">Net Still Owed (USD)</div>
              <div className={`text-lg font-semibold ${netOwedUsd > 0 ? "text-amber-700" : "text-emerald-700"}`}>{fmtMoney(netOwedUsd, "USD")}</div>
            </div>
          </div>

          {payments === null ? (
            <div className="text-sm text-ink/40">Loading…</div>
          ) : (
            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="text-left text-ink/40">
                  <th className="pb-1 pr-2 font-normal">Date</th>
                  <th className="pb-1 pr-2 font-normal">Amount</th>
                  <th className="pb-1 pr-2 font-normal">Applies to Year</th>
                  <th className="pb-1 pr-2 font-normal">Note</th>
                  <th className="pb-1 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="py-1.5 pr-2">{new Date(p.paid_on).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="py-1.5 pr-2">{fmtMoney(p.amount, p.currency)}</td>
                    <td className="py-1.5 pr-2">{p.applies_to_year}</td>
                    <td className="py-1.5 pr-2 text-ink/60">{p.note || "—"}</td>
                    <td className="py-1.5 text-center">
                      <button onClick={() => removePayment(p.id)} className="text-cutoff text-xs">✕</button>
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr><td colSpan={5} className="py-2 text-ink/40 text-xs">No payments recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {adding ? (
            <div className="flex flex-wrap gap-2 items-center">
              <input placeholder="Amount" type="number" className="border rounded px-2 py-1 text-sm w-28" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              <select className="border rounded px-2 py-1 text-sm" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {form.currency !== "USD" && (
                <input placeholder="FX rate to USD" type="number" className="border rounded px-2 py-1 text-sm w-28" value={form.fx_rate} onChange={(e) => setForm({ ...form, fx_rate: e.target.value })} />
              )}
              <input type="date" className="border rounded px-2 py-1 text-sm" value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} />
              <label className="text-xs text-ink/50">Applies to year</label>
              <input type="number" className="border rounded px-2 py-1 text-sm w-20" value={form.applies_to_year} onChange={(e) => setForm({ ...form, applies_to_year: e.target.value })} />
              <input placeholder="Note (optional)" className="border rounded px-2 py-1 text-sm w-40" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              <button onClick={addPayment} disabled={saving} className="text-xs bg-ink text-white px-2 py-1 rounded">{saving ? "…" : "Save"}</button>
              <button onClick={() => { setAdding(false); setError(null); }} className="text-xs border px-2 py-1 rounded">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="text-xs text-accent underline">+ Add Payment</button>
          )}
          {error && <div className="text-xs text-cutoff mt-1">{error}</div>}
        </div>
      )}
    </div>
  );
}
