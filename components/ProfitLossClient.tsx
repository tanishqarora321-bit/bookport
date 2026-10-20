"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import { useYear } from "@/lib/year-context";

type BookingPL = {
  booking_number: string;
  buyer_usd: number;
  forwarder_usd: number;
  supplier_usd: number;
  trucker_usd: number;
  expenses_usd: number;
  net_usd: number;
};

type PartyPL = {
  party_id: string;
  legal_name: string;
  role: "forwarder" | "supplier" | "trucker" | "buyer";
  invoiced_usd: number;
  paid_usd: number;
  net_usd: number;
};

const ROLE_LABELS: Record<PartyPL["role"], string> = {
  forwarder: "Forwarder",
  supplier: "Supplier",
  trucker: "Trucker",
  buyer: "Buyer",
};

function fmtMoney(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? "" : "-"}${Math.abs(n).toFixed(1)}%`;
}

// Booking-number view: Buyer invoice total minus Forwarder+Supplier+
// Trucker expenses for that same booking, per Tanishq's own formula.
// Party view: invoiced vs. paid per party (reusing Payment History's
// data for Forwarders/Suppliers/Truckers; Buyers show invoiced vs. paid
// by their existing PAID/UNPAID status instead, since they're a
// receivable, not something Payment History tracks).
export default function ProfitLossClient() {
  const { year } = useYear();
  const [allYears, setAllYears] = useState(false);
  const [tab, setTab] = useState<"booking" | "party">("booking");
  const [loading, setLoading] = useState(true);
  const [bookingPL, setBookingPL] = useState<BookingPL[]>([]);
  const [partyPL, setPartyPL] = useState<PartyPL[]>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/profit-loss?year=${allYears ? "all" : year}`)
      .then((r) => r.json())
      .then((json) => {
        setBookingPL(json.bookingPL ?? []);
        setPartyPL(json.partyPL ?? []);
      })
      .finally(() => setLoading(false));
  }, [year, allYears]);

  const totalBuyer = bookingPL.reduce((s, b) => s + b.buyer_usd, 0);
  const totalExpenses = bookingPL.reduce((s, b) => s + b.expenses_usd, 0);
  const totalNet = totalBuyer - totalExpenses;
  const marginPct = totalBuyer !== 0 ? (totalNet / totalBuyer) * 100 : 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Profit &amp; Loss</h1>
          <p className="text-sm text-muted">
            {allYears ? "All years" : `Year ${year}`} — each row's own invoice date decides which year it counts toward.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-sm bg-surface border border-line rounded-lg px-3 py-2 cursor-pointer">
          <input type="checkbox" checked={allYears} onChange={(e) => setAllYears(e.target.checked)} />
          All Years
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 shrink-0">
        <StatCard icon={TrendingUp} label="Buyer Revenue (USD)" value={fmtMoney(totalBuyer)} tone="success" />
        <StatCard icon={TrendingDown} label="Total Expenses (USD)" value={fmtMoney(totalExpenses)} tone="danger" />
        <StatCard
          icon={totalNet >= 0 ? TrendingUp : TrendingDown}
          label="Net P&L (USD)"
          value={fmtMoney(totalNet)}
          sub={`${fmtPct(marginPct)} margin`}
          tone={totalNet >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="flex gap-1 border-b border-line mb-4">
        <button
          onClick={() => setTab("booking")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "booking" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}
        >
          By Booking Number
        </button>
        <button
          onClick={() => setTab("party")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "party" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}
        >
          By Party
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted py-10 text-center">Loading…</div>
      ) : tab === "booking" ? (
        <BookingTable rows={bookingPL} />
      ) : (
        <PartyTable rows={partyPL} />
      )}
    </div>
  );
}

function MarginBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, Math.abs(pct)));
  return (
    <div className="w-16 h-1.5 rounded-full bg-surface-2 overflow-hidden shrink-0">
      <div className={`h-full rounded-full ${pct >= 0 ? "bg-success" : "bg-critical"}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function BookingTable({ rows }: { rows: BookingPL[] }) {
  const sorted = [...rows].sort((a, b) => a.booking_number.localeCompare(b.booking_number));
  const totals = rows.reduce(
    (acc, b) => ({
      buyer_usd: acc.buyer_usd + b.buyer_usd,
      forwarder_usd: acc.forwarder_usd + b.forwarder_usd,
      supplier_usd: acc.supplier_usd + b.supplier_usd,
      trucker_usd: acc.trucker_usd + b.trucker_usd,
      expenses_usd: acc.expenses_usd + b.expenses_usd,
      net_usd: acc.net_usd + b.net_usd,
    }),
    { buyer_usd: 0, forwarder_usd: 0, supplier_usd: 0, trucker_usd: 0, expenses_usd: 0, net_usd: 0 }
  );
  return (
    <div className="flex-1 overflow-auto bg-surface border border-line rounded-xl">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-surface-2 border-b border-line">
          <tr className="text-left text-muted">
            <th className="px-3 py-2">Booking Number</th>
            <th className="px-3 py-2">Buyer Revenue</th>
            <th className="px-3 py-2">Forwarder</th>
            <th className="px-3 py-2">Supplier</th>
            <th className="px-3 py-2">Trucker</th>
            <th className="px-3 py-2">Total Expenses</th>
            <th className="px-3 py-2">Net P&L</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => {
            const margin = b.buyer_usd !== 0 ? (b.net_usd / b.buyer_usd) * 100 : 0;
            return (
              <tr key={b.booking_number} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="px-3 py-2 whitespace-nowrap font-medium text-ink">{b.booking_number}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-2">{fmtMoney(b.buyer_usd)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-2">{fmtMoney(b.forwarder_usd)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-2">{fmtMoney(b.supplier_usd)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-2">{fmtMoney(b.trucker_usd)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-2">{fmtMoney(b.expenses_usd)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${b.net_usd >= 0 ? "text-success" : "text-critical"}`}>{fmtMoney(b.net_usd)}</span>
                    <MarginBar pct={margin} />
                  </div>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">No invoiced bookings for this period yet.</td></tr>
          )}
        </tbody>
        {sorted.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-line font-semibold bg-surface-2">
              <td className="px-3 py-2 whitespace-nowrap text-ink">TOTAL</td>
              <td className="px-3 py-2 whitespace-nowrap text-ink">{fmtMoney(totals.buyer_usd)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-ink">{fmtMoney(totals.forwarder_usd)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-ink">{fmtMoney(totals.supplier_usd)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-ink">{fmtMoney(totals.trucker_usd)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-ink">{fmtMoney(totals.expenses_usd)}</td>
              <td className={`px-3 py-2 whitespace-nowrap ${totals.net_usd >= 0 ? "text-success" : "text-critical"}`}>{fmtMoney(totals.net_usd)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function PartyTable({ rows }: { rows: PartyPL[] }) {
  const sorted = [...rows].sort((a, b) => (a.role === b.role ? b.invoiced_usd - a.invoiced_usd : a.role.localeCompare(b.role)));
  const totals = rows.reduce(
    (acc, p) => ({ invoiced_usd: acc.invoiced_usd + p.invoiced_usd, paid_usd: acc.paid_usd + p.paid_usd, net_usd: acc.net_usd + p.net_usd }),
    { invoiced_usd: 0, paid_usd: 0, net_usd: 0 }
  );
  return (
    <div className="flex-1 overflow-auto bg-surface border border-line rounded-xl">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-surface-2 border-b border-line">
          <tr className="text-left text-muted">
            <th className="px-3 py-2">Party</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Invoiced (USD)</th>
            <th className="px-3 py-2">Paid (USD)</th>
            <th className="px-3 py-2">Net (USD)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const paidPct = p.invoiced_usd !== 0 ? (p.paid_usd / p.invoiced_usd) * 100 : 0;
            return (
              <tr key={`${p.role}-${p.party_id}`} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="px-3 py-2 whitespace-nowrap font-medium text-ink">{p.legal_name}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-2">{ROLE_LABELS[p.role]}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-2">{fmtMoney(p.invoiced_usd)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-2">
                  <div className="flex items-center gap-2">
                    {fmtMoney(p.paid_usd)}
                    <MarginBar pct={paidPct} />
                  </div>
                </td>
                <td className={`px-3 py-2 whitespace-nowrap font-semibold ${p.net_usd > 0 ? "text-warning" : "text-success"}`}>
                  {fmtMoney(p.net_usd)} {p.net_usd > 0 ? (p.role === "buyer" ? "(outstanding)" : "(owed)") : ""}
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">No invoiced parties for this period yet.</td></tr>
          )}
        </tbody>
        {sorted.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-line font-semibold bg-surface-2">
              <td className="px-3 py-2 whitespace-nowrap text-ink">TOTAL</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 whitespace-nowrap text-ink">{fmtMoney(totals.invoiced_usd)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-ink">{fmtMoney(totals.paid_usd)}</td>
              <td className={`px-3 py-2 whitespace-nowrap ${totals.net_usd > 0 ? "text-warning" : "text-success"}`}>{fmtMoney(totals.net_usd)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
