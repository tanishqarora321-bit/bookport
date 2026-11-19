"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Percent, DollarSign, Plus } from "lucide-react";
import MultiSelect from "@/components/ui/MultiSelect";
import CommissionImportModal from "@/components/CommissionImportModal";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import { useYear } from "@/lib/year-context";
import type { CommissionBooking } from "@/lib/commission-bookings";

function fmtMoney(n: number) {
  return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtMonth(d: string | null) {
  if (!d) return "—";
  return new Date(`${d.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

const COLS = "minmax(150px,1fr) minmax(150px,1fr) minmax(200px,1.4fr) 150px 130px 150px";

// Operations > Commission Bookings (owner, 2026-11): bookings the company
// earns a commission on. Added by hand or with Import Excel (no link from
// Booking & Instructions). Scoped to the sidebar's Working Year by Month of
// Loading. Each row's Commission Amount is the P&L's Commission for that
// container.
export default function CommissionBookingsClient({
  initialRows,
  ready,
  partyNames,
}: {
  initialRows: CommissionBooking[];
  ready: boolean;
  partyNames: string[];
}) {
  const { year } = useYear();
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);
  const [search, setSearch] = useState("");
  // Multi-select filters: nothing ticked = all.
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [partyFilter, setPartyFilter] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const yearRows = useMemo(() => rows.filter((r) => String(r.month_of_loading).slice(0, 4) === String(year)), [rows, year]);
  const monthOptions = useMemo(() => Array.from(new Set(yearRows.map((r) => String(r.month_of_loading).slice(0, 7)))).sort().reverse(), [yearRows]);
  const partyOptions = useMemo(
    () => Array.from(new Set(yearRows.map((r) => r.commission_party).filter((p): p is string => !!p))).sort((a, b) => a.localeCompare(b)),
    [yearRows]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return yearRows.filter((r) => {
      if (monthFilter.length && !monthFilter.includes(String(r.month_of_loading).slice(0, 7))) return false;
      if (partyFilter.length && !partyFilter.includes(r.commission_party ?? "")) return false;
      if (!q) return true;
      return [r.booking_number, r.container_number, r.commission_party].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [yearRows, search, monthFilter, partyFilter]);
  const total = filtered.reduce((s, r) => s + (Number(r.commission_amount) || 0), 0);
  const yearTotal = yearRows.reduce((s, r) => s + (Number(r.commission_amount) || 0), 0);
  const anyFilter = search || monthFilter.length > 0 || partyFilter.length > 0;
  useEffect(() => setPage(0), [search, monthFilter, partyFilter, pageSize, year]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageStart = Math.min(page, pageCount - 1) * pageSize;
  const paginated = filtered.slice(pageStart, pageStart + pageSize);

  async function save(id: string, patch: Partial<CommissionBooking>) {
    setError(null);
    const res = await fetch(`/api/commission-bookings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Save failed");
    setRows((prev) => prev.map((r) => (r.id === id ? json.booking : r)));
  }
  async function remove(r: CommissionBooking) {
    if (!confirm(`Delete the commission booking ${r.booking_number || r.container_number}? This can't be undone.`)) return;
    setError(null);
    const res = await fetch(`/api/commission-bookings/${r.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Delete failed");
      return;
    }
    setRows((prev) => prev.filter((x) => x.id !== r.id));
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <datalist id="commission-parties">
        {partyNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Commission Bookings</h1>
            <p className="sub">Bookings we earn a commission on - added by hand or with Import Excel. The Commission Amount goes to the P&amp;L for that container.</p>
          </div>
          {/* Equal columns sized to the wider label - both buttons the same size. */}
          <div className="grid grid-flow-col auto-cols-fr gap-2 shrink-0">
            <button
              onClick={() => setImporting(true)}
              disabled={!ready}
              className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium flex items-center justify-center disabled:opacity-50"
            >
              Import Excel
            </button>
            <button
              onClick={() => setAdding((v) => !v)}
              disabled={!ready}
              className="text-sm bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" size={16} /> New Commission Booking
            </button>
          </div>
        </div>
        {!ready && (
          <div className="text-sm text-warning bg-warning-soft border border-warning/30 rounded-lg p-3 mb-4">
            This section needs a one-time database update: run <span className="mono">supabase/migrations/0040_commission_bookings_and_pnl.sql</span> in Supabase&apos;s SQL Editor, then refresh.
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 mb-4" style={{ maxWidth: 720 }}>
          <StatCard icon={Percent} label="Commission Bookings" value={yearRows.length} />
          <StatCard icon={DollarSign} label={`Commission ${year} (USD)`} value={fmtMoney(yearTotal)} tone="success" />
          <StatCard icon={DollarSign} label="Shown (USD)" value={fmtMoney(total)} />
        </div>
        {importing && <CommissionImportModal onClose={() => setImporting(false)} onImported={() => router.refresh()} />}
        {adding && (
          <AddForm
            onCancel={() => setAdding(false)}
            onCreated={(b) => {
              setRows((prev) => [b, ...prev]);
              setAdding(false);
            }}
          />
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-surface border border-line rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-line shrink-0">
          <label style={{ flex: "1 1 260px", maxWidth: 340, display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", border: "1px solid var(--line2)", borderRadius: 9, background: "var(--surf)" }}>
            <Search className="shrink-0" size={15} style={{ color: "var(--tx2)" }} />
            <span className="sr-only">Search commission bookings</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search booking, container, party…"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", font: "inherit", fontSize: 13, color: "var(--tx)" }}
            />
          </label>
          <MultiSelect label="Month of Loading" allLabel="All Months" options={monthOptions} value={monthFilter} onChange={setMonthFilter} format={fmtMonth} />
          <MultiSelect label="Commission Party" allLabel="All Parties" options={partyOptions} value={partyFilter} onChange={setPartyFilter} />
          {anyFilter && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setMonthFilter([]);
                setPartyFilter([]);
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
            <b style={{ color: "var(--tx)" }}>{filtered.length}</b> booking{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
        {error && <div className="text-xs text-cutoff px-4 pt-2">{error}</div>}

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
            <thead className="sticky top-0 z-10 bg-surface-2 shadow-[0_1px_0_var(--line)]">
              <tr className="text-left text-muted" style={{ display: "grid", gridTemplateColumns: COLS }}>
                <th className="px-4 py-2.5 font-medium">Booking Number</th>
                <th className="px-4 py-2.5 font-medium">Container Number</th>
                <th className="px-4 py-2.5 font-medium">Commission Party</th>
                <th className="px-4 py-2.5 font-medium text-right">Commission Amount</th>
                <th className="px-4 py-2.5 font-medium">Month of Loading</th>
                <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => (
                <tr key={r.id} className="border-b border-line hover:bg-surface-2 items-center" style={{ display: "grid", gridTemplateColumns: COLS }}>
                  <Cell value={r.booking_number} mono onSave={(v) => save(r.id, { booking_number: v })} accent />
                  <Cell value={r.container_number} mono onSave={(v) => save(r.id, { container_number: v })} accent />
                  <Cell value={r.commission_party} list="commission-parties" onSave={(v) => save(r.id, { commission_party: v })} />
                  <Cell value={String(r.commission_amount ?? "")} display={fmtMoney(r.commission_amount)} number onSave={(v) => save(r.id, { commission_amount: v as any })} />
                  <Cell value={String(r.month_of_loading).slice(0, 7)} display={fmtMonth(r.month_of_loading)} month onSave={(v) => save(r.id, { month_of_loading: v })} />
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => remove(r)} className="text-xs text-cutoff hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="font-medium bg-surface-2 border-t border-line" style={{ display: "grid", gridTemplateColumns: COLS }}>
                  <td className="px-4 py-2 text-ink">Total</td>
                  <td />
                  <td />
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(total)}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          {filtered.length === 0 && (
            <EmptyState
              icon={Percent}
              title={yearRows.length === 0 ? `No commission bookings in ${year}` : "No commission bookings match these filters"}
              hint={yearRows.length === 0 ? 'Click "New Commission Booking" above to add one.' : undefined}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-t border-line shrink-0">
          <span className="text-xs text-muted tabular-nums">
            {filtered.length === 0 ? "Showing 0 of 0" : `Showing ${pageStart + 1}-${Math.min(pageStart + pageSize, filtered.length)} of ${filtered.length}`}
          </span>
          <div className="flex items-center gap-2.5">
            <label className="flex items-center gap-2 text-xs text-muted">
              Rows per page
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="border border-line rounded-lg px-2 py-1 text-xs bg-surface">
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={pageStart === 0} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium disabled:opacity-50">
              Previous
            </button>
            <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={pageStart + pageSize >= filtered.length} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (b: CommissionBooking) => void }) {
  const [form, setForm] = useState({ booking_number: "", container_number: "", commission_party: "", commission_amount: "", month_of_loading: thisMonth() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/commission-bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't save");
      onCreated(json.booking);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const input = "border border-line bg-surface rounded-lg px-2 py-1.5 text-sm w-full";
  return (
    <div className="border border-accent/30 bg-accent-soft rounded-xl p-4 mb-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <label className="text-xs text-muted flex flex-col gap-1">
          Booking Number
          <input autoFocus autoComplete="off" className={`${input} mono`} value={form.booking_number} onChange={(e) => setForm({ ...form, booking_number: e.target.value })} />
        </label>
        <label className="text-xs text-muted flex flex-col gap-1">
          Container Number
          <input autoComplete="off" className={`${input} mono`} value={form.container_number} onChange={(e) => setForm({ ...form, container_number: e.target.value })} />
        </label>
        <label className="text-xs text-muted flex flex-col gap-1">
          Commission Party
          <input autoComplete="off" list="commission-parties" className={input} value={form.commission_party} onChange={(e) => setForm({ ...form, commission_party: e.target.value })} />
        </label>
        <label className="text-xs text-muted flex flex-col gap-1">
          Commission Amount (USD)
          <input autoComplete="off" inputMode="decimal" className={`${input} tabular-nums`} value={form.commission_amount} onChange={(e) => setForm({ ...form, commission_amount: e.target.value })} />
        </label>
        <label className="text-xs text-muted flex flex-col gap-1">
          Month of Loading
          <input type="month" className={input} value={form.month_of_loading} onChange={(e) => setForm({ ...form, month_of_loading: e.target.value })} />
        </label>
      </div>
      {error && <div className="text-xs text-cutoff mt-2">{error}</div>}
      <div className="flex gap-2 mt-3">
        <button onClick={save} disabled={saving} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60">
          {saving ? "Saving…" : "Save Commission Booking"}
        </button>
        <button onClick={onCancel} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm">Cancel</button>
      </div>
    </div>
  );
}

// Click to edit; Enter or leaving the box saves.
function Cell({
  value,
  display,
  onSave,
  mono = false,
  number = false,
  month = false,
  accent = false,
  list,
}: {
  value: string | null;
  display?: string;
  onSave: (v: string) => Promise<void>;
  mono?: boolean;
  number?: boolean;
  month?: boolean;
  accent?: boolean;
  list?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    if (val === (value ?? "")) {
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

  return (
    <td className={`px-4 py-2 min-w-0 ${number ? "text-right tabular-nums" : ""}`}>
      {editing ? (
        <>
          <input
            autoFocus
            autoComplete="off"
            list={list}
            type={month ? "month" : "text"}
            inputMode={number ? "decimal" : undefined}
            className={`border border-accent rounded-lg px-2 py-1 text-sm w-full bg-surface ${mono ? "mono" : ""} ${number ? "text-right" : ""}`}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setVal(value ?? "");
                setEditing(false);
              }
            }}
          />
          {error && <div className="text-xs text-cutoff mt-0.5 whitespace-normal">{error}</div>}
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setVal(value ?? "");
            setEditing(true);
          }}
          className={`block w-full truncate ${number ? "text-right" : "text-left"} hover:bg-surface-2 rounded px-1 -mx-1 ${mono ? "mono" : ""} ${accent ? "font-semibold text-accent" : "text-ink"}`}
          title="Click to edit"
        >
          {display ?? (value || <span className="text-muted">—</span>)}
        </button>
      )}
    </td>
  );
}
