"use client";

import { useMemo, useState } from "react";
import { Search, TrendingUp, TrendingDown, DollarSign, Percent, Download } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import MultiSelect from "@/components/ui/MultiSelect";
import EmptyState from "@/components/ui/EmptyState";
import { useYear } from "@/lib/year-context";
import { dateInWorkingYear } from "@/lib/year-scope";
import { usePersistentState } from "@/lib/hooks/usePersistentState";
import { rowCost, rowSell, type PnlRow } from "@/lib/pnl-report";

function money(v: number) {
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtMonth(d: string | null) {
  if (!d) return "—";
  return new Date(`${d.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
const dash = <span className="text-muted">—</span>;

type Adjust = "pier_pass" | "discount_to_customer" | "discount_from_supplier";

// Profit & Loss (owner, 2026-11) - one row per container, two views:
//   Elaborate: every party, invoice number, item, weight and amount;
//   Consolidated: Month of Loading, Buyer, Booking, Container, Invoice,
//   Total Cost, Total Sell (and the profit).
// Total Sell = Buyer + Discount from Supplier + Commission
// Total Cost = Supplier + Forwarder + Trucking + Discount to Customer + Pier Pass
// Scoped to the sidebar's Working Year by Month of Loading.
export default function PnlClient({ initialRows, ready }: { initialRows: PnlRow[]; ready: boolean }) {
  const { year } = useYear();
  const [rows, setRows] = useState(initialRows);
  const [view, setView] = usePersistentState<"elaborate" | "consolidated">(`pnl:view`, "elaborate");
  const [search, setSearch] = usePersistentState(`pnl:search`, "");
  // Multi-select filters: nothing ticked = all.
  const [month, setMonth] = usePersistentState<string[]>(`pnl:month`, []);
  const [buyer, setBuyer] = usePersistentState<string[]>(`pnl:buyer`, []);
  const [supplier, setSupplier] = usePersistentState<string[]>(`pnl:supplier`, []);
  const [forwarder, setForwarder] = usePersistentState<string[]>(`pnl:forwarder`, []);
  const [trucker, setTrucker] = usePersistentState<string[]>(`pnl:trucker`, []);
  const [item, setItem] = usePersistentState<string[]>(`pnl:item`, []);

  const yearRows = useMemo(() => rows.filter((r) => dateInWorkingYear(r.month, year)), [rows, year]);
  const opts = (pick: (r: PnlRow) => string | null) =>
    Array.from(new Set(yearRows.map(pick).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b));
  const monthOptions = useMemo(() => Array.from(new Set(yearRows.map((r) => r.month?.slice(0, 7)).filter((v): v is string => !!v))).sort(), [yearRows]);
  const buyerOptions = useMemo(() => opts((r) => r.buyer), [yearRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const supplierOptions = useMemo(() => opts((r) => r.supplier), [yearRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const forwarderOptions = useMemo(() => opts((r) => r.forwarder), [yearRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const truckerOptions = useMemo(() => opts((r) => r.trucker), [yearRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const itemOptions = useMemo(() => opts((r) => r.item), [yearRows]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return yearRows.filter((r) => {
      const pass = (sel: string[], v: string | null | undefined) => sel.length === 0 || sel.includes(v ?? "");
      if (!pass(month, r.month?.slice(0, 7))) return false;
      if (!pass(buyer, r.buyer)) return false;
      if (!pass(supplier, r.supplier)) return false;
      if (!pass(forwarder, r.forwarder)) return false;
      if (!pass(trucker, r.trucker)) return false;
      if (!pass(item, r.item)) return false;
      if (!q) return true;
      return [r.booking_number, r.container_number, r.buyer, r.supplier, r.forwarder, r.trucker, r.inv_buyer, r.inv_supplier, r.inv_forwarder, r.item, r.commission_parties]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [yearRows, search, month, buyer, supplier, forwarder, trucker, item]);

  const sum = (f: (r: PnlRow) => number) => filtered.reduce((s, r) => s + f(r), 0);
  const totalSell = sum(rowSell);
  const totalCost = sum(rowCost);
  const profit = totalSell - totalCost;
  const margin = totalSell ? (profit / totalSell) * 100 : 0;
  const anyFilter = search || [month, buyer, supplier, forwarder, trucker, item].some((f) => f.length > 0);

  async function saveAdjust(r: PnlRow, field: Adjust, value: string) {
    const res = await fetch(`/api/pnl-adjustments/${r.tracking_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Save failed");
    setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, [field]: Number(json.adjustment?.[field]) || 0 } : x)));
  }

  function exportCsv() {
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const elaborate = view === "elaborate";
    const head = elaborate
      ? ["Sr. No", "Month of Loading", "Buyer", "Supplier", "Trucker", "Forwarder", "Invoice No (Buyer)", "Invoice No (Supplier)", "Invoice No (Forwarder)", "Item", "Weight", "Booking Number", "Container Number", "Freight", "Buyer", "Supplier", "Forwarder", "Trucking", "Pier Pass", "Commission", "Discount to Customer", "Discount from Supplier", "Total"]
      : ["Sr. No", "Month of Loading", "Buyer", "Booking Number", "Container Number", "Invoice Number", "Total Cost", "Total Sell", "Profit"];
    const lines = filtered.map((r, i) =>
      elaborate
        ? [i + 1, r.month?.slice(0, 7), r.buyer, r.supplier, r.trucker, r.forwarder, r.inv_buyer, r.inv_supplier, r.inv_forwarder, r.item, r.weight != null ? `${r.weight} ${r.weight_unit ?? ""}`.trim() : "", r.booking_number, r.container_number, r.freight.toFixed(2), r.buyer_usd.toFixed(2), r.supplier_usd.toFixed(2), r.forwarder_usd.toFixed(2), r.trucker_usd.toFixed(2), r.pier_pass.toFixed(2), r.commission.toFixed(2), r.discount_to_customer.toFixed(2), r.discount_from_supplier.toFixed(2), (rowSell(r) - rowCost(r)).toFixed(2)]
        : [i + 1, r.month?.slice(0, 7), r.buyer, r.booking_number, r.container_number, r.inv_buyer, rowCost(r).toFixed(2), rowSell(r).toFixed(2), (rowSell(r) - rowCost(r)).toFixed(2)]
    );
    const csv = [head, ...lines].map((l) => l.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pnl-${view}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sel = (label: string, value: string[], set: (v: string[]) => void, options: string[], all: string) =>
    options.length > 0 ? <MultiSelect label={label} allLabel={all} options={options} value={value} onChange={set} width={170} /> : null;

  const th = "px-3 py-2.5 font-medium whitespace-nowrap sticky top-0 z-10 bg-surface-2";
  const thR = `${th} text-right`;
  const td = "px-3 py-2.5 whitespace-nowrap";
  const tdR = `${td} text-right tabular-nums`;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Profit &amp; Loss</h1>
            <p className="sub">Per container: Total Sell (Buyer + Discount from Supplier + Commission) minus Total Cost (Supplier + Forwarder + Trucking + Discount to Customer + Pier Pass).</p>
          </div>
          <button onClick={exportCsv} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium flex items-center gap-1.5 shrink-0">
            <Download className="w-4 h-4" size={16} /> Export CSV
          </button>
        </div>
        {!ready && (
          <div className="text-sm text-warning bg-warning-soft border border-warning/30 rounded-lg p-3 mb-4">
            Pier Pass, the discounts and Commission need a one-time database update: run <span className="mono">supabase/migrations/0040_commission_bookings_and_pnl.sql</span> in Supabase&apos;s SQL Editor, then refresh.
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard icon={TrendingUp} label="Total Sell (USD)" value={money(totalSell)} />
          <StatCard icon={DollarSign} label="Total Cost (USD)" value={money(totalCost)} />
          <StatCard icon={profit >= 0 ? TrendingUp : TrendingDown} label="Profit (USD)" value={money(profit)} tone={profit >= 0 ? "success" : "danger"} />
          <StatCard icon={Percent} label="Margin" value={`${margin.toFixed(1)}%`} tone={margin >= 0 ? "default" : "danger"} />
        </div>
        <div className="flex gap-1 border-b border-line mb-4">
          {(["elaborate", "consolidated"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${view === v ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}
            >
              {v === "elaborate" ? "Elaborate" : "Consolidated"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-surface border border-line rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-line shrink-0">
          <label style={{ flex: "1 1 240px", maxWidth: 320, display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", border: "1px solid var(--line2)", borderRadius: 9, background: "var(--surf)" }}>
            <Search className="shrink-0" size={15} style={{ color: "var(--tx2)" }} />
            <span className="sr-only">Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search booking, container, party, invoice…"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", font: "inherit", fontSize: 13, color: "var(--tx)" }}
            />
          </label>
          {monthOptions.length > 0 && <MultiSelect label="Month of Loading" allLabel="All Months" options={monthOptions} value={month} onChange={setMonth} format={fmtMonth} width={170} />}
          {sel("Buyer", buyer, setBuyer, buyerOptions, "All Buyers")}
          {sel("Supplier", supplier, setSupplier, supplierOptions, "All Suppliers")}
          {sel("Forwarder", forwarder, setForwarder, forwarderOptions, "All Forwarders")}
          {sel("Trucker", trucker, setTrucker, truckerOptions, "All Truckers")}
          {sel("Item", item, setItem, itemOptions, "All Items")}
          {anyFilter && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setMonth([]);
                setBuyer([]);
                setSupplier([]);
                setForwarder([]);
                setTrucker([]);
                setItem([]);
              }}
              className="chip"
              aria-label="Clear filters"
              title="Clear filters"
              style={{ height: 36, width: 36, padding: 0, justifyContent: "center", color: "var(--accent)", borderColor: "var(--accent)" }}
            >
              ✕
            </button>
          )}
          <div style={{ flex: "1 1 0" }} />
          <span className="lbl num" aria-live="polite">
            <b style={{ color: "var(--tx)" }}>{filtered.length}</b> container{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {view === "elaborate" ? (
            <table className="text-sm border-collapse min-w-full">
              <thead>
                <tr className="text-left text-muted">
                  <th className={th}>Sr. No</th>
                  <th className={th}>Buyer</th>
                  <th className={th}>Supplier</th>
                  <th className={th}>Trucker</th>
                  <th className={th}>Forwarder</th>
                  <th className={th}>Invoice No (Buyer)</th>
                  <th className={th}>Invoice No (Supplier)</th>
                  <th className={th}>Invoice No (Forwarder)</th>
                  <th className={th}>Item</th>
                  <th className={thR}>Weight</th>
                  <th className={th}>Booking Number</th>
                  <th className={th}>Container Number</th>
                  <th className={thR}>Freight</th>
                  <th className={thR}>Buyer</th>
                  <th className={thR}>Supplier</th>
                  <th className={thR}>Forwarder</th>
                  <th className={thR}>Trucking</th>
                  <th className={thR}>Pier Pass ✎</th>
                  <th className={thR}>Commission</th>
                  <th className={thR}>Discount to Customer ✎</th>
                  <th className={thR}>Discount from Supplier ✎</th>
                  <th className={thR}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const total = rowSell(r) - rowCost(r);
                  const editable = ready && !!r.tracking_id;
                  return (
                    <tr key={r.key} className="border-b border-line hover:bg-surface-2">
                      <td className={`${td} text-muted tabular-nums`}>{i + 1}</td>
                      <td className={td}>{r.buyer || dash}</td>
                      <td className={td}>{r.supplier || dash}</td>
                      <td className={td}>{r.trucker || dash}</td>
                      <td className={td}>{r.forwarder || dash}</td>
                      <td className={`${td} mono`}>{r.inv_buyer || dash}</td>
                      <td className={`${td} mono`}>{r.inv_supplier || dash}</td>
                      <td className={`${td} mono`}>{r.inv_forwarder || dash}</td>
                      <td className={td}>{r.item || dash}</td>
                      <td className={tdR}>{r.weight != null ? `${r.weight.toLocaleString()} ${r.weight_unit ?? ""}` : dash}</td>
                      <td className={`${td} mono font-semibold text-accent`}>{r.booking_number || dash}</td>
                      <td className={`${td} mono font-semibold text-accent`}>{r.container_number || dash}</td>
                      <td className={tdR}>{r.freight ? money(r.freight) : dash}</td>
                      <td className={tdR}>{money(r.buyer_usd)}</td>
                      <td className={tdR}>{money(r.supplier_usd)}</td>
                      <td className={tdR}>{money(r.forwarder_usd)}</td>
                      <td className={tdR}>{money(r.trucker_usd)}</td>
                      <AdjustCell value={r.pier_pass} editable={editable} onSave={(v) => saveAdjust(r, "pier_pass", v)} />
                      <td className={tdR} title={r.commission_parties ? `Commission party: ${r.commission_parties}` : undefined}>{r.commission ? money(r.commission) : dash}</td>
                      <AdjustCell value={r.discount_to_customer} editable={editable} onSave={(v) => saveAdjust(r, "discount_to_customer", v)} />
                      <AdjustCell value={r.discount_from_supplier} editable={editable} onSave={(v) => saveAdjust(r, "discount_from_supplier", v)} />
                      <td className={`${tdR} font-semibold`} style={{ color: total < 0 ? "var(--crit)" : "var(--ok)" }}>{money(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="font-semibold bg-surface-2 border-t border-line">
                    <td className={td} colSpan={12}>Totals in USD</td>
                    <td className={tdR}>{money(sum((r) => r.freight))}</td>
                    <td className={tdR}>{money(sum((r) => r.buyer_usd))}</td>
                    <td className={tdR}>{money(sum((r) => r.supplier_usd))}</td>
                    <td className={tdR}>{money(sum((r) => r.forwarder_usd))}</td>
                    <td className={tdR}>{money(sum((r) => r.trucker_usd))}</td>
                    <td className={tdR}>{money(sum((r) => r.pier_pass))}</td>
                    <td className={tdR}>{money(sum((r) => r.commission))}</td>
                    <td className={tdR}>{money(sum((r) => r.discount_to_customer))}</td>
                    <td className={tdR}>{money(sum((r) => r.discount_from_supplier))}</td>
                    <td className={tdR} style={{ color: profit < 0 ? "var(--crit)" : "var(--ok)" }}>{money(profit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (
            <table className="text-sm border-collapse min-w-full">
              <thead>
                <tr className="text-left text-muted">
                  <th className={th}>Sr. No</th>
                  <th className={th}>Month of Loading</th>
                  <th className={th}>Buyer</th>
                  <th className={th}>Booking Number</th>
                  <th className={th}>Container Number</th>
                  <th className={th}>Invoice Number</th>
                  <th className={thR}>Total Cost</th>
                  <th className={thR}>Total Sell</th>
                  <th className={thR}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const cost = rowCost(r);
                  const sell = rowSell(r);
                  return (
                    <tr key={r.key} className="border-b border-line hover:bg-surface-2">
                      <td className={`${td} text-muted tabular-nums`}>{i + 1}</td>
                      <td className={td}>{fmtMonth(r.month)}</td>
                      <td className={td}>{r.buyer || dash}</td>
                      <td className={`${td} mono font-semibold text-accent`}>{r.booking_number || dash}</td>
                      <td className={`${td} mono font-semibold text-accent`}>{r.container_number || dash}</td>
                      <td className={`${td} mono`}>{r.inv_buyer || dash}</td>
                      <td className={tdR}>{money(cost)}</td>
                      <td className={tdR}>{money(sell)}</td>
                      <td className={`${tdR} font-semibold`} style={{ color: sell - cost < 0 ? "var(--crit)" : "var(--ok)" }}>{money(sell - cost)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="font-semibold bg-surface-2 border-t border-line">
                    <td className={td} colSpan={6}>Totals in USD</td>
                    <td className={tdR}>{money(totalCost)}</td>
                    <td className={tdR}>{money(totalSell)}</td>
                    <td className={tdR} style={{ color: profit < 0 ? "var(--crit)" : "var(--ok)" }}>{money(profit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          {filtered.length === 0 && <EmptyState icon={DollarSign} title={yearRows.length === 0 ? `Nothing in ${year} yet` : "No containers match these filters"} />}
        </div>
      </div>
    </div>
  );
}

// Pier Pass / discounts: click to type a value, Enter or leaving saves.
function AdjustCell({ value, editable, onSave }: { value: number; editable: boolean; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cls = "px-3 py-1.5 whitespace-nowrap text-right tabular-nums";

  async function commit() {
    if (val.trim() === String(value || "") || (val.trim() === "" && !value)) {
      setEditing(false);
      return;
    }
    try {
      await onSave(val);
      setEditing(false);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (!editable) return <td className={cls}>{value ? money(value) : dash}</td>;
  return (
    <td className={cls}>
      {editing ? (
        <>
          <input
            autoFocus
            autoComplete="off"
            inputMode="decimal"
            aria-label="Amount"
            className="border border-accent rounded-lg px-2 py-1 text-sm w-28 text-right bg-surface"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          {error && <div className="text-xs text-cutoff">{error}</div>}
        </>
      ) : (
        <button
          type="button"
          className="w-full text-right hover:bg-surface-2 rounded px-1 border border-dashed border-transparent hover:border-line"
          title="Click to enter"
          onClick={() => {
            setVal(value ? String(value) : "");
            setEditing(true);
          }}
        >
          {value ? money(value) : <span className="text-muted">+ add</span>}
        </button>
      )}
    </td>
  );
}
