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

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Profit & Loss</h1>
          <p className="text-sm text-ink/40">
            {allYears ? "All years" : `Year ${year}`} — each row's own invoice date decides which year it counts toward.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
          <input type="checkbox" checked={allYears} onChange={(e) => setAllYears(e.target.checked)} />
          All Years
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 shrink-0">
        <StatCard icon={TrendingUp} label="Buyer Revenue (USD)" value={fmtMoney(totalBuyer)} tone="success" />
        <StatCard icon={TrendingDown} label="Total Expenses (USD)" value={fmtMoney(totalExpenses)} tone="danger" />
        <StatCard icon={totalNet >= 0 ? TrendingUp : TrendingDown} label="Net P&L (USD)" value={fmtMoney(totalNet)} tone={totalNet >= 0 ? "success" : "danger"} />
      </div>

      <div className="flex gap-1 border-b border-ink/10 mb-4">
        <button
          onClick={() => setTab("booking")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "booking" ? "border-accent text-accent" : "border-transparent text-ink/50 hover:text-ink"}`}
        >
          By Booking Number
        </button>
        <button
          onClick={() => setTab("party")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "party" ? "border-accent text-accent" : "border-transparent text-ink/50 hover:text-ink"}`}
        >
          By Party
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-ink/40 py-10 text-center">Loading…</div>
      ) : tab === "booking" ? (
        <BookingTable rows={bookingPL} />
      ) : (
        <PartyTable rows={partyPL} />
      )}
    </div>
  );
}

function BookingTable({ rows }: { rows: BookingPL[] }) {
  const sorted = [...rows].sort((a, b) => a.booking_number.localeCompare(b.booking_number));
  return (
    <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-slate-50 border-b">
          <tr className="text-left text-ink/50">
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
          {sorted.map((b) => (
            <tr key={b.booking_number} className="border-b last:border-0 hover:bg-slate-50/70">
              <td className="px-3 py-2 whitespace-nowrap font-medium text-ink">{b.booking_number}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(b.buyer_usd)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(b.forwarder_usd)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(b.supplier_usd)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(b.trucker_usd)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(b.expenses_usd)}</td>
              <td className={`px-3 py-2 whitespace-nowrap font-semibold ${b.net_usd >= 0 ? "text-emerald-700" : "text-cutoff"}`}>{fmtMoney(b.net_usd)}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-8 text-center text-ink/40">No invoiced bookings for this period yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PartyTable({ rows }: { rows: PartyPL[] }) {
  const sorted = [...rows].sort((a, b) => (a.role === b.role ? b.invoiced_usd - a.invoiced_usd : a.role.localeCompare(b.role)));
  return (
    <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-slate-50 border-b">
          <tr className="text-left text-ink/50">
            <th className="px-3 py-2">Party</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Invoiced (USD)</th>
            <th className="px-3 py-2">Paid (USD)</th>
            <th className="px-3 py-2">Net (USD)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={`${p.role}-${p.party_id}`} className="border-b last:border-0 hover:bg-slate-50/70">
              <td className="px-3 py-2 whitespace-nowrap font-medium text-ink">{p.legal_name}</td>
              <td className="px-3 py-2 whitespace-nowrap text-ink/60">{ROLE_LABELS[p.role]}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(p.invoiced_usd)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(p.paid_usd)}</td>
              <td className={`px-3 py-2 whitespace-nowrap font-semibold ${p.net_usd > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                {fmtMoney(p.net_usd)} {p.net_usd > 0 ? (p.role === "buyer" ? "(outstanding)" : "(owed)") : ""}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-8 text-center text-ink/40">No invoiced parties for this period yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
