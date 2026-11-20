"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { eachLimited } from "@/lib/each-limited";
import { useYear } from "@/lib/year-context";
import { usePersistentState } from "@/lib/hooks/usePersistentState";
import { buildComparison, colLabel } from "@/lib/freight-compare";
import { lineKey } from "@/lib/freight-normalize";

type Entry = {
  id: string;
  origin: string;
  shipping_line: string;
  rate: number | null;
  free_days: number | null;
  sort_order: number;
};

type RateSheet = {
  id: string;
  forwarder_name: string;
  destination: string;
  rate_month: string;
  currency: string;
  source_type: "pdf" | "excel" | "manual";
  source_file_name: string | null;
  notes: string | null;
  add_on?: number | null;
  add_on_by_line?: Record<string, number> | null;
  charges_note?: string | null;
  created_at: string;
  entries: Entry[];
};

export type LastAddOn = { add_on: number; add_on_by_line: Record<string, number> };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const money = (n: number) => `$${Math.round(n * 100) / 100 === Math.round(n) ? Math.round(n).toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function fmtMonth(m: string) {
  // m is 'YYYY-MM-01'
  return new Date(m + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function monthToInputValue(m: string) {
  return m.slice(0, 7); // 'YYYY-MM'
}

// ---------------- Shared icons (16px stroke, aria-hidden) ----------------

function DownloadIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon({ size = 13 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="pen" aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}



// Freight Comparison (owner, 2026-11): every forwarder's monthly rate sheet
// for one destination, side by side - rows are origins, columns
// "Forwarder - Line", each rate including that forwarder's per-container
// add-on. Green = cheapest per origin; blue = the cheapest with at least the
// chosen free days ("cheap and more free time"). Upload up to 8 PDFs /
// Excel files at once; the Working Year comes from the sidebar.
export default function FreightComparisonClient({
  selectedYear,
  monthOptions,
  destinationOptions,
  selectedMonth,
  selectedDestination,
  initialSheets,
  lastAddOns,
  forwarderNames,
  isAdmin = false,
}: {
  yearOptions: string[];
  selectedYear: string;
  monthOptions: string[];
  destinationOptions: string[];
  selectedMonth: string;
  selectedDestination: string;
  initialSheets: RateSheet[];
  lastAddOns: Record<string, LastAddOn>;
  forwarderNames: string[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [sheets, setSheets] = useState(initialSheets);
  useEffect(() => setSheets(initialSheets), [initialSheets]);
  const [uploading, setUploading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [minFree, setMinFree] = usePersistentState<number>("freight:minFree", 10);
  const [search, setSearch] = usePersistentState<string>("freight:search", "");

  const visibleSheetIds = useMemo(() => sheets.map((s) => s.id), [sheets]);
  const bulk = useBulkSelection(visibleSheetIds);
  useEffect(() => {
    bulk.pruneToVisible(new Set(visibleSheetIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSheetIds.join(",")]);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  async function bulkDeleteSelected() {
    setBulkDeleting(true);
    setBulkError(null);
    const ids = bulk.selectedIds;
    const succeeded: string[] = [];
    const failures: string[] = [];
    await eachLimited(ids, 6, async (id) => {
      const name = sheets.find((s) => s.id === id)?.forwarder_name ?? id;
      try {
        const res = await fetch(`/api/rate-sheets/${id}`, { method: "DELETE" });
        if (res.ok) succeeded.push(id);
        else failures.push(`${name}: ${(await res.json().catch(() => ({}))).error || "failed"}`);
      } catch (err: any) {
        failures.push(`${name}: ${err?.message || "network error"}`);
      }
    });
    setSheets((prev) => prev.filter((s) => !succeeded.includes(s.id)));
    setBulkDeleting(false);
    setBulkConfirming(false);
    bulk.clear();
    if (failures.length > 0) setBulkError(`${failures.length} of ${ids.length} couldn't be deleted:\n${failures.join("\n")}`);
    if (succeeded.length > 0) router.refresh();
  }

  function navigate(month: string, destination: string, year: string = selectedYear) {
    router.push(`/freight-comparison?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}&destination=${encodeURIComponent(destination)}`);
  }

  // The sidebar's Working Year drives this page like every other module.
  const { year: workingYear } = useYear();
  useEffect(() => {
    if (selectedYear !== String(workingYear)) router.replace(`/freight-comparison?year=${workingYear}&destination=${encodeURIComponent(selectedDestination)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingYear, selectedYear]);

  // All 12 months of the Working Year are pickable; the ones with sheets are marked.
  const months = useMemo(() => MONTH_NAMES.map((_, i) => `${workingYear}-${String(i + 1).padStart(2, "0")}-01`), [workingYear]);

  const { columns, rows, colByKey } = useMemo(() => buildComparison(sheets, minFree), [sheets, minFree]);
  const shownRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.label.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  // Column groups by forwarder for the two-row header.
  const groups = useMemo(() => {
    const g: { forwarder: string; span: number }[] = [];
    for (const c of columns) {
      const last = g[g.length - 1];
      if (last && last.forwarder === c.forwarder) last.span += 1;
      else g.push({ forwarder: c.forwarder, span: 1 });
    }
    return g;
  }, [columns]);

  const exportHref = `/api/rate-sheets/export?month=${encodeURIComponent(selectedMonth)}&destination=${encodeURIComponent(selectedDestination)}&minFree=${minFree}`;
  const cellBorder = "1px solid var(--line)";

  return (
    <div className="h-full flex flex-col overflow-y-auto" style={{ gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="h1">Freight Comparison</h1>
          <p className="sub">
            {fmtMonth(selectedMonth)} — {selectedDestination} · {sheets.length} forwarder{sheets.length === 1 ? "" : "s"} · rates include each forwarder&apos;s add-on per container
          </p>
        </div>
        <div className="grid grid-flow-col auto-cols-fr gap-2">
          <a href={rows.length ? exportHref : undefined} aria-disabled={!rows.length} className={`btn ${rows.length ? "" : "opacity-50 pointer-events-none"}`}>
            <DownloadIcon />
            Download Excel
          </a>
          <button type="button" onClick={() => setUploading(true)} className="btn btn-p">
            <PlusIcon />
            Upload Rate Sheets
          </button>
        </div>
      </div>

      {uploading && (
        <UploadPanel
          year={workingYear}
          defaultMonth={selectedMonth.startsWith(String(workingYear)) ? selectedMonth : `${workingYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`}
          defaultDestination={selectedDestination}
          lastAddOns={lastAddOns}
          forwarderNames={forwarderNames}
          onClose={() => setUploading(false)}
          onSaved={(month, destination) => {
            setUploading(false);
            if (month !== selectedMonth || destination !== selectedDestination) navigate(month, destination, String(workingYear));
            else router.refresh();
          }}
        />
      )}

      <section className="card flex-1 flex flex-col" style={{ overflow: "hidden", minHeight: 460 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div className="field" style={{ width: 190 }}>
            <label htmlFor="fm">Month ({workingYear})</label>
            <select id="fm" className="select select-s" value={selectedMonth} onChange={(e) => navigate(e.target.value, selectedDestination, String(workingYear))}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {fmtMonth(m)}
                  {monthOptions.includes(m) ? " ●" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 180 }}>
            <label htmlFor="fd">Destination</label>
            <select id="fd" className="select select-s" value={selectedDestination} onChange={(e) => navigate(selectedMonth, e.target.value)}>
              {!destinationOptions.includes(selectedDestination) && <option value={selectedDestination}>{selectedDestination}</option>}
              {destinationOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 190 }}>
            <label htmlFor="fmin">Best value needs</label>
            <select id="fmin" className="select select-s" value={minFree} onChange={(e) => setMinFree(Number(e.target.value))}>
              {[7, 8, 10, 12, 14].map((d) => (
                <option key={d} value={d}>
                  {d}+ free days
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 200 }}>
            <label htmlFor="fs">Origin</label>
            <input id="fs" type="search" autoComplete="off" className="input input-s" placeholder="Search origin…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ flex: 1 }} />
          <div className="lbl" style={{ display: "flex", gap: 14, alignItems: "center", paddingBottom: 6, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, background: "#C6EFCE", border: "1px solid #3a9b52" }} />
              Cheapest
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, background: "#DDEBF7", border: "1px solid #2f6db5" }} />
              Best value ({minFree}+ free days)
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, background: "var(--warnS)", border: "1px solid var(--warn)" }} />
              Under {minFree} free days
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="text-sm border-collapse" style={{ minWidth: "100%" }}>
            <caption className="sr">
              Ocean freight comparison for {selectedDestination}, {fmtMonth(selectedMonth)}: origins by forwarder and shipping line, rates include each forwarder&apos;s add-on
            </caption>
            <thead>
              <tr>
                <th rowSpan={3} className="sticky left-0 top-0 z-30 bg-surface-2 px-3 py-2 text-left font-semibold text-ink" style={{ minWidth: 170, borderRight: cellBorder, verticalAlign: "bottom" }}>
                  Origin
                </th>
                {groups.map((g, i) => (
                  <th key={i} colSpan={g.span} className="sticky top-0 z-20 bg-surface-2 px-2 py-1.5 text-center font-semibold text-ink" style={{ borderLeft: cellBorder, borderBottom: cellBorder, height: 32 }}>
                    {g.forwarder}
                  </th>
                ))}
                <th rowSpan={3} className="sticky top-0 z-20 bg-surface-2 px-3 py-2 text-right font-semibold text-ink" style={{ borderLeft: cellBorder, minWidth: 100, verticalAlign: "bottom" }}>
                  Lowest Rate
                </th>
                <th rowSpan={3} className="sticky top-0 z-20 bg-surface-2 px-3 py-2 text-left font-semibold text-ink" style={{ minWidth: 190, verticalAlign: "bottom" }}>
                  Lowest Forwarder / Line
                </th>
                <th rowSpan={3} className="sticky top-0 z-20 bg-surface-2 px-3 py-2 text-left font-semibold text-ink" style={{ minWidth: 200, verticalAlign: "bottom" }}>
                  Best value ({minFree}+ days)
                </th>
              </tr>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="sticky z-20 bg-surface-2 px-2 py-1 text-right font-semibold text-text-2 whitespace-nowrap" style={{ top: 32, borderLeft: cellBorder, height: 28 }}>
                    {c.line}
                  </th>
                ))}
              </tr>
              <tr>
                {columns.map((c) => {
                  const short = c.freeDays !== null && c.freeDays < minFree;
                  return (
                    <th
                      key={c.key}
                      className="sticky z-20 px-2 py-1 text-right font-normal whitespace-nowrap"
                      style={{ top: 60, borderLeft: cellBorder, borderBottom: cellBorder, background: short ? "var(--warnS)" : "var(--surf2)", color: short ? "var(--warn)" : "var(--mut)", fontSize: 11 }}
                      title={`${c.freeDays ?? "?"} destination free days · ${money(c.addOn)} added per container`}
                    >
                      {c.freeDays ?? "?"} days · +{money(c.addOn)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shownRows.map((row) => (
                <tr key={row.key} className="hover:bg-surface-2">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-semibold text-ink whitespace-nowrap" style={{ borderRight: cellBorder, borderBottom: cellBorder }}>
                    {row.label}
                  </td>
                  {columns.map((c) => {
                    const cell = row.cells[c.key];
                    const isLow = !!cell && row.lowestCols.includes(c.key);
                    const isBest = !!cell && row.best?.col === c.key;
                    return (
                      <td
                        key={c.key}
                        className="px-2 py-2 text-right tabular-nums whitespace-nowrap"
                        style={{
                          borderLeft: cellBorder,
                          borderBottom: cellBorder,
                          ...(isLow ? { background: "#C6EFCE", color: "#1e6b34", fontWeight: 700 } : isBest ? { background: "#DDEBF7", color: "#1d4f8c", fontWeight: 700 } : {}),
                        }}
                        title={cell ? `${colLabel(c)}: ${money(cell.base)} + ${money(cell.addOn)} added = ${money(cell.rate)} · ${cell.freeDays ?? c.freeDays ?? "?"} free days` : undefined}
                      >
                        {cell ? money(cell.rate) : <span className="text-muted">—</span>}
                        {(isLow || isBest) && <span className="sr">{isLow ? " (cheapest)" : " (best value)"}</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ borderLeft: cellBorder, borderBottom: cellBorder, color: "#1e6b34" }}>
                    {row.lowest !== null ? money(row.lowest) : "—"}
                  </td>
                  <td className="px-3 py-2 text-text-2" style={{ borderBottom: cellBorder, whiteSpace: "normal", minWidth: 190 }}>
                    {row.lowestCols.map((k) => colLabel(colByKey.get(k)!)).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2" style={{ borderBottom: cellBorder, whiteSpace: "normal", minWidth: 200, color: row.best ? "#1d4f8c" : "var(--mut)" }}>
                    {row.best ? `${colLabel(colByKey.get(row.best.col)!)} · ${money(row.best.rate)}` : row.lowest !== null ? "Same as lowest" : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 4} style={{ textAlign: "center", padding: "40px 12px", whiteSpace: "normal" }}>
                    <span className="lbl">No rate sheets yet for {fmtMonth(selectedMonth)} / {selectedDestination}. Click &quot;Upload Rate Sheets&quot; to add up to 8 PDFs or Excel files.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <button
          type="button"
          aria-expanded={manageOpen}
          onClick={() => setManageOpen(!manageOpen)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", border: 0, background: "transparent", color: "var(--tx)", font: "inherit", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronIcon open={manageOpen} />
          <span className="h2" style={{ flex: 1 }}>
            Manage uploaded rate sheets ({sheets.length})
          </span>
          <span className="lbl">{manageOpen ? "Hide" : "Show"}</span>
        </button>
        {manageOpen && (
          <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            {isAdmin && (
              <BulkActionBar count={bulk.selectedCount} itemLabel="rate sheet" onDeleteClick={() => setBulkConfirming(true)} onClear={bulk.clear} deleting={bulkDeleting} />
            )}
            {sheets.map((s) => (
              <SheetManageCard
                key={s.id}
                sheet={s}
                onDeleted={() => {
                  setSheets(sheets.filter((x) => x.id !== s.id));
                  router.refresh();
                }}
                onChanged={() => router.refresh()}
                isAdmin={isAdmin}
                selected={bulk.selected.has(s.id)}
                onToggleSelect={() => bulk.toggle(s.id)}
              />
            ))}
            {sheets.length === 0 && <p className="meta">No sheets for this month/destination yet.</p>}
          </div>
        )}
      </section>

      {bulkConfirming && (
        <div className="scrim" onClick={() => !bulkDeleting && setBulkConfirming(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <h2 className="h2">Delete {bulk.selectedCount} rate sheet{bulk.selectedCount === 1 ? "" : "s"}?</h2>
            </div>
            <div className="mb">
              <p className="lbl">This permanently removes each selected rate sheet and all of its rate rows. This cannot be undone.</p>
            </div>
            <div className="mf">
              <button type="button" onClick={() => setBulkConfirming(false)} disabled={bulkDeleting} className="btn btn-g">
                Cancel
              </button>
              <button type="button" onClick={bulkDeleteSelected} disabled={bulkDeleting} className="btn btn-dp">
                {bulkDeleting ? "Deleting…" : `Delete ${bulk.selectedCount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkError && (
        <div className="scrim" onClick={() => setBulkError(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <h2 className="h2">Some deletes failed</h2>
            </div>
            <div className="mb">
              <p className="lbl" style={{ whiteSpace: "pre-wrap" }}>{bulkError}</p>
            </div>
            <div className="mf">
              <button type="button" onClick={() => setBulkError(null)} className="btn btn-p">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Upload: up to 8 PDFs / Excel files, read, reviewed, saved ----------------

const MAX_FILES = 8;

type Extracted = {
  forwarder_name: string | null;
  entries: { origin: string; shipping_line: string; rate: number | null; free_days: number | null; forwarder?: string | null }[];
  charges: { label: string; amount: number | null; shipping_lines: string[] }[];
};

// A combined comparison sheet (columns "UAL - COSCO", "Speedex - MSC"...) holds
// several forwarders: split its rates per forwarder (from the reader's
// `forwarder`, else the "Forwarder - Line" header itself).
function splitByForwarder(result: Extracted): { forwarder: string; entries: Extracted["entries"] }[] | null {
  const groups = new Map<string, Extracted["entries"]>();
  for (const e of result.entries) {
    let fwd = (e.forwarder ?? "").trim();
    let line = e.shipping_line;
    const m = !fwd ? String(e.shipping_line).match(/^(.+?)\s+[-–]\s+(.+)$/) : null;
    if (m) {
      fwd = m[1].trim();
      line = m[2].trim();
    }
    if (!fwd) return null;
    groups.set(fwd, [...(groups.get(fwd) ?? []), { ...e, forwarder: fwd, shipping_line: line }]);
  }
  return groups.size > 1 ? Array.from(groups, ([forwarder, entries]) => ({ forwarder, entries })) : null;
}

type Job = {
  file: File;
  status: "waiting" | "reading" | "done" | "error";
  error?: string;
  result?: Extracted;
  forwarder: string;
  addOn: string;
  byLine: Record<string, string>;
  include: boolean;
  part?: string; // forwarder, for one part of a combined sheet
};

function chargesText(charges: Extracted["charges"]) {
  return charges
    .map((c) => `${c.label}${c.amount != null ? ` $${c.amount}` : ""}${c.shipping_lines?.length ? ` (${c.shipping_lines.join(", ")})` : ""}`)
    .join("; ");
}

function UploadPanel({
  year,
  defaultMonth,
  defaultDestination,
  lastAddOns,
  forwarderNames,
  onClose,
  onSaved,
}: {
  year: number;
  defaultMonth: string;
  defaultDestination: string;
  lastAddOns: Record<string, LastAddOn>;
  forwarderNames: string[];
  onClose: () => void;
  onSaved: (month: string, destination: string) => void;
}) {
  const [monthNum, setMonthNum] = useState(defaultMonth.slice(5, 7));
  const [destination, setDestination] = useState(defaultDestination || "Mundra, IN");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const month = `${year}-${monthNum}-01`;

  const patchJob = (i: number, patch: Partial<Job>) => setJobs((prev) => prev.map((j, k) => (k === i ? { ...j, ...patch } : j)));

  // Remembered add-on for a forwarder (its most recent sheet), e.g. UAL +65, ONE +75.
  function rememberedFor(name: string) {
    return lastAddOns[name.trim().toUpperCase()] ?? null;
  }

  function pickFiles(list: FileList | null) {
    setError(null);
    const files = Array.from(list ?? []);
    const room = MAX_FILES - jobs.length;
    if (files.length > room) setError(`Up to ${MAX_FILES} files at a time - the first ${room} were added.`);
    setJobs((prev) => [
      ...prev,
      ...files.slice(0, Math.max(0, room)).map((file) => ({ file, status: "waiting" as const, forwarder: "", addOn: "", byLine: {}, include: true })),
    ]);
  }

  async function readAll() {
    setReading(true);
    setError(null);
    const indexes = jobs.map((j, i) => (j.status === "waiting" || j.status === "error" ? i : -1)).filter((i) => i >= 0);
    await eachLimited(indexes, 3, async (i) => {
      patchJob(i, { status: "reading", error: undefined });
      try {
        const body = new FormData();
        body.append("file", jobs[i].file);
        const res = await fetch("/api/rate-sheets/extract", { method: "POST", body });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Couldn't read this file");
        const result: Extracted = { forwarder_name: json.forwarder_name ?? null, entries: json.entries ?? [], charges: json.charges ?? [] };
        const guess = (result.forwarder_name || jobs[i].file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")).trim();
        const known = forwarderNames.find((n) => n.toLowerCase() === guess.toLowerCase() || guess.toLowerCase().includes(n.toLowerCase())) ?? guess;
        const mem = rememberedFor(known);
        patchJob(i, {
          status: result.entries.length ? "done" : "error",
          error: result.entries.length ? undefined : "No rates found in this file",
          result,
          forwarder: known,
          addOn: mem ? String(mem.add_on || "") : "",
          byLine: mem ? Object.fromEntries(Object.entries(mem.add_on_by_line).map(([k, v]) => [k, String(v)])) : {},
        });
      } catch (err: any) {
        patchJob(i, { status: "error", error: err.message });
      }
    });
    // A combined sheet becomes one card per forwarder. Its rates usually
    // already include the add-ons, so these start at +$0 (no double adding).
    setJobs((prev) =>
      prev.flatMap((j) => {
        if (j.status !== "done" || j.part || !j.result) return [j];
        const parts = splitByForwarder(j.result);
        if (!parts) return [j];
        return parts.map((p) => {
          const known = forwarderNames.find((n) => n.toLowerCase() === p.forwarder.toLowerCase()) ?? p.forwarder;
          return { ...j, part: p.forwarder, forwarder: known, addOn: "", byLine: {}, result: { ...j.result!, entries: p.entries } };
        });
      })
    );
    setReading(false);
  }

  // Files start reading as soon as they're picked.
  useEffect(() => {
    if (!reading && !saving && jobs.some((j) => j.status === "waiting")) readAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.length]);

  const ready = jobs.filter((j) => j.include && j.status === "done");
  async function saveAll() {
    if (ready.some((j) => !j.forwarder.trim())) {
      setError("Enter the forwarder name for every file.");
      return;
    }
    setSaving(true);
    setError(null);
    const failures: string[] = [];
    const warnings = new Set<string>();
    for (const j of ready) {
      const byLine: Record<string, number> = {};
      for (const [k, v] of Object.entries(j.byLine)) if (v.trim() !== "" && Number.isFinite(Number(v))) byLine[k] = Number(v);
      try {
        const res = await fetch("/api/rate-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            forwarder_name: j.forwarder.trim(),
            destination,
            rate_month: month,
            source_type: /\.pdf$/i.test(j.file.name) ? "pdf" : "excel",
            source_file_name: j.file.name,
            add_on: j.addOn.trim() === "" ? 0 : Number(j.addOn),
            add_on_by_line: byLine,
            charges_note: chargesText(j.result!.charges) || null,
            entries: j.result!.entries,
            replace_existing: true,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) failures.push(`${j.file.name}: ${json.error || "failed"}`);
        if (json.warning) warnings.add(json.warning);
      } catch (err: any) {
        failures.push(`${j.file.name}: ${err.message}`);
      }
    }
    setSaving(false);
    if (failures.length) {
      setError(failures.join("\n"));
      return;
    }
    if (warnings.size) alert(Array.from(warnings).join("\n"));
    onSaved(month, destination);
  }

  return (
    <section className="card" style={{ padding: "18px 20px" }} aria-labelledby="up-h">
      <datalist id="fc-forwarders">
        {forwarderNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 id="up-h" className="h2">Upload rate sheets</h2>
          <p className="lbl">Up to {MAX_FILES} files at once - PDF emails or Excel (.xlsx) / CSV. Each is read automatically; check it, then save.</p>
        </div>
        <button type="button" className="ib" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-3">
        <div className="field" style={{ width: 200 }}>
          <label htmlFor="up-month">Month of these rates ({year})</label>
          <select id="up-month" className="select" value={monthNum} onChange={(e) => setMonthNum(e.target.value)}>
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, "0")}>
                {m} {year}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ width: 200 }}>
          <label htmlFor="up-dest">Destination</label>
          <input id="up-dest" className="input" autoComplete="off" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </div>
        <div className="field" style={{ flex: "1 1 260px" }}>
          <label htmlFor="up-files">Files ({jobs.length}/{MAX_FILES})</label>
          <input
            id="up-files"
            type="file"
            multiple
            accept=".pdf,.xlsx,.xlsm,.csv,application/pdf"
            className="input"
            disabled={jobs.length >= MAX_FILES || reading || saving}
            onChange={(e) => {
              pickFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="flex flex-col gap-3">
          {jobs.map((j, i) => {
            const lines = Array.from(new Set((j.result?.entries ?? []).map((e) => lineKey(e.shipping_line))));
            const freeByLine = new Map<string, Set<number>>();
            for (const e of j.result?.entries ?? []) if (e.free_days != null) freeByLine.set(lineKey(e.shipping_line), (freeByLine.get(lineKey(e.shipping_line)) ?? new Set()).add(e.free_days));
            return (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, opacity: j.include ? 1 : 0.55 }}>
                <div className="flex flex-wrap items-center gap-3">
                  <input type="checkbox" aria-label={`Include ${j.file.name}`} checked={j.include} onChange={(e) => patchJob(i, { include: e.target.checked })} disabled={j.status !== "done"} />
                  <b className="text-ink" style={{ flex: "1 1 220px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={j.file.name}>
                    {j.file.name}
                    {j.part && <span className="text-muted font-normal"> · {j.part} (combined sheet - check whether its rates already include the add-on)</span>}
                  </b>
                  <span className={`badge ${j.status === "done" ? "b-ok" : j.status === "error" ? "b-crit" : j.status === "reading" ? "b-acc" : "b-neu"}`}>
                    {j.status === "done" ? `${j.result!.entries.length} rates` : j.status === "reading" ? "Reading…" : j.status === "error" ? "Not read" : "Waiting"}
                  </span>
                  {!reading && !saving && (
                    <button type="button" className="ib" aria-label={`Remove ${j.file.name}`} onClick={() => setJobs((prev) => prev.filter((_, k) => k !== i))}>
                      ✕
                    </button>
                  )}
                </div>
                {j.error && <p className="err mt-1">{j.error}</p>}
                {j.status === "done" && (
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="field" style={{ width: 220 }}>
                        <label>Forwarder</label>
                        <input
                          className="input input-s"
                          list="fc-forwarders"
                          autoComplete="off"
                          value={j.forwarder}
                          onChange={(e) => {
                            const name = e.target.value;
                            const mem = rememberedFor(name);
                            patchJob(i, mem ? { forwarder: name, addOn: String(mem.add_on || ""), byLine: Object.fromEntries(Object.entries(mem.add_on_by_line).map(([k, v]) => [k, String(v)])) } : { forwarder: name });
                          }}
                        />
                      </div>
                      <div className="field" style={{ width: 170 }}>
                        <label>Add per container ($)</label>
                        <input className="input input-s num" inputMode="decimal" placeholder="e.g. 65" value={j.addOn} onChange={(e) => patchJob(i, { addOn: e.target.value })} />
                      </div>
                      <span className="lbl" style={{ paddingBottom: 8 }}>Different for a line? Set it here:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {lines.map((l) => (
                        <label key={l} className="flex items-center gap-1.5 text-xs border border-line rounded-lg px-2 py-1" title={`${l}: ${Array.from(freeByLine.get(l) ?? []).join("/") || "?"} free days`}>
                          <span className="font-semibold text-ink">{l}</span>
                          <span className="text-muted">{Array.from(freeByLine.get(l) ?? []).join("/") || "?"}d · +$</span>
                          <input
                            className="border border-line rounded px-1 py-0.5 w-14 text-right bg-surface"
                            inputMode="decimal"
                            aria-label={`Add per container for ${l}`}
                            placeholder={j.addOn || "0"}
                            value={j.byLine[l] ?? ""}
                            onChange={(e) => patchJob(i, { byLine: { ...j.byLine, [l]: e.target.value } })}
                          />
                        </label>
                      ))}
                    </div>
                    {j.result!.charges.length > 0 && (
                      <p className="lbl" style={{ fontSize: 12 }}>
                        <b>Charges in this sheet:</b> {chargesText(j.result!.charges)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="err mt-2" style={{ whiteSpace: "pre-wrap" }}>{error}</p>}

      <div className="flex flex-wrap justify-end gap-2 mt-4 pt-3 border-t border-line">
        <button type="button" className="btn btn-g" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        {(reading || jobs.some((j) => j.status === "error")) && (
          <button type="button" className="btn" onClick={readAll} disabled={reading || saving}>
            {reading ? "Reading files…" : "Try again"}
          </button>
        )}
        <button type="button" className="btn btn-p" onClick={saveAll} disabled={saving || reading || ready.length === 0}>
          {saving ? "Saving…" : `Save ${ready.length} sheet${ready.length === 1 ? "" : "s"} for ${MONTH_NAMES[Number(monthNum) - 1]} ${year}`}
        </button>
      </div>
      <p className="meta mt-2">Saving a forwarder again for the same month replaces its earlier sheet.</p>
    </section>
  );
}

function SheetManageCard({
  sheet,
  onDeleted,
  onChanged,
  isAdmin = false,
  selected = false,
  onToggleSelect,
}: {
  sheet: RateSheet;
  onDeleted: () => void;
  onChanged: () => void;
  isAdmin?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(sheet.entries);
  const [deleting, setDeleting] = useState(false);

  async function deleteSheet() {
    if (!confirm(`Delete the entire "${sheet.forwarder_name}" rate sheet? This removes all ${rows.length} rate rows.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/rate-sheets/${sheet.id}`, { method: "DELETE" });
    if (res.ok) onDeleted();
    setDeleting(false);
  }

  async function patchEntry(entryId: string, field: keyof Entry, value: string) {
    const res = await fetch(`/api/rate-sheets/${sheet.id}/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const json = await res.json();
    if (!res.ok) return;
    setRows(rows.map((r) => (r.id === entryId ? json.entry : r)));
    onChanged();
  }

  async function deleteEntry(entryId: string) {
    const res = await fetch(`/api/rate-sheets/${sheet.id}/entries/${entryId}`, { method: "DELETE" });
    if (!res.ok) return;
    setRows(rows.filter((r) => r.id !== entryId));
    onChanged();
  }

  const sourceLabel = sheet.source_type === "manual" ? "manual entry" : sheet.source_file_name;

  // The per-container add-on: one amount, plus exceptions per line
  // ("ONE=75, MSC=100").
  const [addOn, setAddOn] = useState(String(sheet.add_on ?? 0));
  const [byLine, setByLine] = useState(
    Object.entries(sheet.add_on_by_line ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")
  );
  const [addOnMsg, setAddOnMsg] = useState<string | null>(null);
  async function saveAddOn() {
    setAddOnMsg(null);
    const parsed: Record<string, number> = {};
    for (const part of byLine.split(",").map((x) => x.trim()).filter(Boolean)) {
      const m = part.match(/^(.+?)\s*[=:]\s*\+?\$?(-?[\d.]+)$/);
      if (!m) {
        setAddOnMsg(`"${part}" - write it as LINE=amount, e.g. ONE=75`);
        return;
      }
      parsed[m[1].trim().toUpperCase()] = Number(m[2]);
    }
    const res = await fetch(`/api/rate-sheets/${sheet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ add_on: addOn, add_on_by_line: parsed }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAddOnMsg(json.error || "Couldn't save");
      return;
    }
    setAddOnMsg("Saved");
    onChanged();
  }

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--surf2)" }}>
        {isAdmin && (
          <input
            type="checkbox"
            aria-label={`Select rate sheet ${sheet.forwarder_name}`}
            checked={selected}
            onChange={onToggleSelect}
          />
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 8, border: 0, background: "transparent", font: "inherit", color: "var(--tx)", cursor: "pointer", textAlign: "left" }}
        >
          <ChevronIcon open={open} />
          <span>
            <b style={{ fontWeight: 600 }}>{sheet.forwarder_name}</b> <span className="lbl">— {rows.length} rates — {sourceLabel}</span>
          </span>
        </button>
        <button type="button" className="btn btn-s btn-g btn-d" onClick={deleteSheet} disabled={deleting}>
          {deleting ? "…" : "Delete Sheet"}
        </button>
      </div>
      {open && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div className="field" style={{ width: 160 }}>
            <label>Add per container ($)</label>
            <input className="input input-s num" inputMode="decimal" value={addOn} onChange={(e) => setAddOn(e.target.value)} />
          </div>
          <div className="field" style={{ flex: "1 1 240px" }}>
            <label>Different per line (LINE=amount, comma separated)</label>
            <input className="input input-s" autoComplete="off" placeholder="ONE=75, MSC=100" value={byLine} onChange={(e) => setByLine(e.target.value)} />
          </div>
          <button type="button" className="btn btn-s" onClick={saveAddOn}>
            Save add-on
          </button>
          {addOnMsg && <span className={addOnMsg === "Saved" ? "lbl" : "err"}>{addOnMsg}</span>}
          {sheet.charges_note && (
            <p className="lbl" style={{ width: "100%", fontSize: 12 }}>
              <b>Charges in this sheet:</b> {sheet.charges_note}
            </p>
          )}
        </div>
      )}
      {open && (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr>
                <th>Origin</th>
                <th>Shipping Line</th>
                <th className="r">Rate</th>
                <th className="r">Free Days</th>
                <th>
                  <span className="sr">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <RowCell value={r.origin} onSave={(v) => patchEntry(r.id, "origin", v)} />
                  <RowCell value={r.shipping_line} onSave={(v) => patchEntry(r.id, "shipping_line", v)} />
                  <RowCell value={r.rate?.toString() ?? ""} isNumber onSave={(v) => patchEntry(r.id, "rate", v)} />
                  <RowCell value={r.free_days?.toString() ?? ""} isNumber onSave={(v) => patchEntry(r.id, "free_days", v)} />
                  <td className="r">
                    <button type="button" className="ib" aria-label={`Remove ${r.origin} ${r.shipping_line} rate`} onClick={() => deleteEntry(r.id)}>
                      <RemoveIcon />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="meta" style={{ padding: "10px 12px" }}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RowCell({
  value,
  onSave,
  isNumber = false,
}: {
  value: string | null;
  onSave: (v: string) => Promise<void>;
  isNumber?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(val);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <td className={isNumber ? "r num" : undefined}>
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "text", padding: 0 }}
        >
          {value ? <span>{value}</span> : <span className="dash">—</span>}
          <PencilIcon />
        </button>
      </td>
    );
  }

  return (
    <td className={isNumber ? "r" : undefined}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: isNumber ? "flex-end" : "flex-start" }}>
        <input
          autoFocus
          type={isNumber ? "number" : "text"}
          className="input input-s"
          style={isNumber ? { width: 90, textAlign: "right" } : undefined}
          aria-label="Edit value"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <button type="button" className="ib" onClick={save} disabled={saving} aria-label="Save">
          <CheckIcon size={14} />
        </button>
      </div>
    </td>
  );
}

