"use client";

import { useEffect, useState } from "react";
import { TrendingDown } from "lucide-react";
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

// Party role (P&L) badge map per design spec: Buyer b-ok · Forwarder b-acc ·
// Supplier b-info · Trucker b-warn.
const ROLE_BADGE: Record<PartyPL["role"], string> = {
  buyer: "b-ok",
  forwarder: "b-acc",
  supplier: "b-info",
  trucker: "b-warn",
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h1">Profit &amp; Loss</h1>
          <p className="sub">
            {allYears ? "All years" : `Year ${year}`} — each row&rsquo;s own invoice date decides which year it counts toward.
          </p>
        </div>
        <label className="inline-flex items-center gap-2.5 text-sm font-medium cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={allYears}
            aria-label="All Years"
            className={`sw ${allYears ? "on" : ""}`}
            onClick={() => setAllYears((v) => !v)}
          />
          All Years
        </label>
      </div>

      <section aria-label="Totals" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
        <div className="card kpi">
          <span className="lbl">Buyer Revenue (USD)</span>
          <span className="v text-success">{fmtMoney(totalBuyer)}</span>
          <span className="meta">Sum of buyer invoices {allYears ? "across all years" : `dated in ${year}`}</span>
        </div>
        <div className="card kpi">
          <span className="lbl">Total Expenses (USD)</span>
          <span className="v text-critical" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingDown aria-hidden="true" size={18} />
            {fmtMoney(totalExpenses)}
          </span>
          <span className="meta">Forwarder + Supplier + Trucker</span>
        </div>
        <div className="card kpi">
          <span className="lbl">Net P&amp;L (USD)</span>
          <span className="v" style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span className={totalNet >= 0 ? "text-success" : "text-critical"}>{fmtMoney(totalNet)}</span>
            <span className={`badge ${totalNet >= 0 ? "b-ok" : "b-crit"}`}>{fmtPct(marginPct)} margin</span>
          </span>
          <span className="meta">Revenue − expenses</span>
        </div>
      </section>

      <section className="card" style={{ overflow: "hidden" }}>
        <div role="tablist" aria-label="P&amp;L view" className="tabs" style={{ padding: "0 12px" }}>
          <button
            role="tab"
            aria-selected={tab === "booking"}
            className={`tab ${tab === "booking" ? "on" : ""}`}
            onClick={() => setTab("booking")}
          >
            By Booking Number
          </button>
          <button
            role="tab"
            aria-selected={tab === "party"}
            className={`tab ${tab === "party" ? "on" : ""}`}
            onClick={() => setTab("party")}
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
      </section>
    </div>
  );
}

function MarginBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, Math.abs(pct)));
  return (
    <span
      aria-hidden="true"
      className="inline-block w-14 h-1.5 rounded-full bg-surface-2 overflow-hidden align-middle"
    >
      <span
        className={`block h-full rounded-full ${pct >= 0 ? "bg-success" : "bg-critical"}`}
        style={{ width: `${clamped}%` }}
      />
    </span>
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
    <div className="tw" style={{ maxHeight: "560px" }}>
      <table className="tbl" style={{ minWidth: "900px" }}>
        <thead>
          <tr>
            <th>Booking Number</th>
            <th className="r">Buyer Revenue</th>
            <th className="r">Forwarder</th>
            <th className="r">Supplier</th>
            <th className="r">Trucker</th>
            <th className="r">Total Expenses</th>
            <th className="r">Net P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b: BookingPL) => {
            const margin = b.buyer_usd !== 0 ? (b.net_usd / b.buyer_usd) * 100 : 0;
            return (
              <tr key={b.booking_number}>
                <td className="mono" style={{ fontWeight: 500 }}>
                  {b.booking_number}
                </td>
                <td className="r num">{fmtMoney(b.buyer_usd)}</td>
                <td className="r num">{fmtMoney(b.forwarder_usd)}</td>
                <td className="r num">{fmtMoney(b.supplier_usd)}</td>
                <td className="r num">{fmtMoney(b.trucker_usd)}</td>
                <td className="r num">{fmtMoney(b.expenses_usd)}</td>
                <td className="r num">
                  <span className="inline-flex items-center gap-2">
                    <span className={b.net_usd >= 0 ? "text-success" : "text-critical"} style={{ fontWeight: 600 }}>
                      {fmtMoney(b.net_usd)}
                    </span>
                    <MarginBar pct={margin} />
                  </span>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7} className="meta" style={{ padding: "32px 12px", textAlign: "center" }}>
                No invoiced bookings for this period yet.
              </td>
            </tr>
          )}
        </tbody>
        {sorted.length > 0 && (
          <tfoot>
            <tr>
              <td>TOTAL</td>
              <td className="r num">{fmtMoney(totals.buyer_usd)}</td>
              <td className="r num">{fmtMoney(totals.forwarder_usd)}</td>
              <td className="r num">{fmtMoney(totals.supplier_usd)}</td>
              <td className="r num">{fmtMoney(totals.trucker_usd)}</td>
              <td className="r num">{fmtMoney(totals.expenses_usd)}</td>
              <td className={`r num ${totals.net_usd >= 0 ? "text-success" : "text-critical"}`}>{fmtMoney(totals.net_usd)}</td>
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
    <div className="tw" style={{ maxHeight: "560px" }}>
      <table className="tbl" style={{ minWidth: "760px" }}>
        <thead>
          <tr>
            <th>Party</th>
            <th>Role</th>
            <th className="r">Invoiced (USD)</th>
            <th className="r">Paid (USD)</th>
            <th className="r">Net (USD)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p: PartyPL) => {
            const paidPct = p.invoiced_usd !== 0 ? (p.paid_usd / p.invoiced_usd) * 100 : 0;
            return (
              <tr key={`${p.role}-${p.party_id}`}>
                <td style={{ fontWeight: 500 }}>{p.legal_name}</td>
                <td>
                  <span className={`badge ${ROLE_BADGE[p.role]}`}>{ROLE_LABELS[p.role]}</span>
                </td>
                <td className="r num">{fmtMoney(p.invoiced_usd)}</td>
                <td className="r num">
                  <span className="inline-flex items-center gap-2">
                    {fmtMoney(p.paid_usd)}
                    <MarginBar pct={paidPct} />
                  </span>
                </td>
                <td className={`r num ${p.net_usd > 0 ? "text-warning" : "text-success"}`} style={{ fontWeight: 600 }}>
                  {fmtMoney(p.net_usd)}{" "}
                  {p.net_usd > 0 ? <span className="meta">{p.role === "buyer" ? "(outstanding)" : "(owed)"}</span> : null}
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="meta" style={{ padding: "32px 12px", textAlign: "center" }}>
                No invoiced parties for this period yet.
              </td>
            </tr>
          )}
        </tbody>
        {sorted.length > 0 && (
          <tfoot>
            <tr>
              <td>TOTAL</td>
              <td></td>
              <td className="r num">{fmtMoney(totals.invoiced_usd)}</td>
              <td className="r num">{fmtMoney(totals.paid_usd)}</td>
              <td className={`r num ${totals.net_usd > 0 ? "text-warning" : "text-success"}`}>{fmtMoney(totals.net_usd)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
