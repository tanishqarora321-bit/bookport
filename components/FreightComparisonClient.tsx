"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";

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
  source_type: "pdf" | "manual";
  source_file_name: string | null;
  notes: string | null;
  created_at: string;
  entries: Entry[];
};

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

export default function FreightComparisonClient({
  yearOptions,
  selectedYear,
  monthOptions,
  destinationOptions,
  selectedMonth,
  selectedDestination,
  initialSheets,
  isAdmin = false,
}: {
  yearOptions: string[];
  selectedYear: string;
  monthOptions: string[];
  destinationOptions: string[];
  selectedMonth: string;
  selectedDestination: string;
  initialSheets: RateSheet[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [sheets, setSheets] = useState(initialSheets);
  const [uploading, setUploading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

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
    for (const id of ids) {
      const target = sheets.find((s) => s.id === id);
      const name = target?.forwarder_name ?? id;
      try {
        const res = await fetch(`/api/rate-sheets/${id}`, { method: "DELETE" });
        if (res.ok) {
          succeeded.push(id);
        } else {
          const json = await res.json().catch(() => ({}));
          failures.push(`${name}: ${json.error || "failed"}`);
        }
      } catch (err: any) {
        failures.push(`${name}: ${err?.message || "network error"}`);
      }
    }
    setSheets((prev) => prev.filter((s) => !succeeded.includes(s.id)));
    setBulkDeleting(false);
    setBulkConfirming(false);
    bulk.clear();
    if (failures.length > 0) {
      setBulkError(`${failures.length} of ${ids.length} couldn't be deleted:\n${failures.join("\n")}`);
    }
    if (succeeded.length > 0) router.refresh();
  }

  function navigate(month: string, destination: string, year: string = selectedYear) {
    router.push(`/freight-comparison?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}&destination=${encodeURIComponent(destination)}`);
  }

  function navigateYear(year: string) {
    // Dropping the month param lets the server pick that year's own
    // default month instead of carrying over a month from a different year.
    router.push(`/freight-comparison?year=${encodeURIComponent(year)}&destination=${encodeURIComponent(selectedDestination)}`);
  }

  // ---------------- Pivot: origins x (forwarder + shipping_line) columns ----------------

  const { origins, columns, matrix } = useMemo(() => {
    const originSet = new Map<string, string>(); // normalized -> display
    const columnMap = new Map<string, { forwarder_name: string; shipping_line: string; free_days: number | null }>();
    const cellMap = new Map<string, number>(); // `${originKey}||${colKey}` -> rate

    for (const sheet of sheets) {
      for (const e of sheet.entries) {
        if (e.rate === null || e.rate === undefined) continue;
        const originKey = e.origin.trim().toUpperCase();
        if (!originSet.has(originKey)) originSet.set(originKey, e.origin.trim());

        const colKey = `${sheet.forwarder_name}||${e.shipping_line.trim().toUpperCase()}`;
        if (!columnMap.has(colKey)) {
          columnMap.set(colKey, {
            forwarder_name: sheet.forwarder_name,
            shipping_line: e.shipping_line.trim(),
            free_days: e.free_days ?? null,
          });
        } else if (columnMap.get(colKey)!.free_days === null && e.free_days !== null) {
          columnMap.get(colKey)!.free_days = e.free_days;
        }

        cellMap.set(`${originKey}||${colKey}`, e.rate);
      }
    }

    const originsSorted = Array.from(originSet.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    // Group columns by shipping line (matches the reference sheet's layout), then by forwarder within.
    const columnsSorted = Array.from(columnMap.entries()).sort((a, b) => {
      const lineCompare = a[1].shipping_line.localeCompare(b[1].shipping_line);
      if (lineCompare !== 0) return lineCompare;
      return a[1].forwarder_name.localeCompare(b[1].forwarder_name);
    });

    return { origins: originsSorted, columns: columnsSorted, matrix: cellMap };
  }, [sheets]);

  // Visual-only grouping of the already-sorted columns by shipping line, so the
  // table can render a shipping-line header row above the forwarder sub-header row.
  const lineGroups = useMemo(() => {
    const groups: { shippingLine: string; span: number }[] = [];
    for (const [, col] of columns) {
      const last = groups[groups.length - 1];
      if (last && last.shippingLine === col.shipping_line) {
        last.span += 1;
      } else {
        groups.push({ shippingLine: col.shipping_line, span: 1 });
      }
    }
    return groups;
  }, [columns]);

  function exportCsv() {
    const header = ["Origin", ...columns.map(([, c]) => `${c.forwarder_name} - ${c.shipping_line}`)];
    const freeDaysRow = ["Free Days", ...columns.map(([, c]) => (c.free_days ?? ""))];
    const rows = origins.map(([originKey, originDisplay]) => [
      originDisplay,
      ...columns.map(([colKey]) => matrix.get(`${originKey}||${colKey}`) ?? ""),
    ]);
    const csv = [header, freeDaysRow, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mundra-comparison-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------- Cheapest-per-origin highlighting ----------------

  function cheapestColKeyForOrigin(originKey: string): string | null {
    let best: string | null = null;
    let bestRate = Infinity;
    for (const [colKey] of columns) {
      const v = matrix.get(`${originKey}||${colKey}`);
      if (v !== undefined && v < bestRate) {
        bestRate = v;
        best = colKey;
      }
    }
    return best;
  }

  return (
    <div className="h-full flex flex-col" style={{ gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="h1">Freight Comparison</h1>
          <p className="sub">
            {fmtMonth(selectedMonth)} — {selectedDestination}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={exportCsv} disabled={origins.length === 0} className="btn">
            <DownloadIcon />
            Export CSV
          </button>
          <button type="button" onClick={() => setUploading(true)} className="btn btn-p">
            <PlusIcon />
            + Upload Rate Sheet
          </button>
        </div>
      </div>

      {uploading && (
        <UploadPanel
          defaultMonth={selectedMonth}
          defaultDestination={selectedDestination}
          onClose={() => setUploading(false)}
          onSaved={() => {
            setUploading(false);
            router.refresh();
          }}
        />
      )}

      <section className="card" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div className="field" style={{ width: 150 }}>
            <label htmlFor="fy">Year</label>
            <select id="fy" className="select select-s" value={selectedYear} onChange={(e) => navigateYear(e.target.value)}>
              <option value="all">All Years</option>
              {!yearOptions.includes(selectedYear) && selectedYear !== "all" && <option value={selectedYear}>{selectedYear}</option>}
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 180 }}>
            <label htmlFor="fm">Month</label>
            <select id="fm" className="select select-s" value={selectedMonth} onChange={(e) => navigate(e.target.value, selectedDestination)}>
              {!monthOptions.includes(selectedMonth) && <option value={selectedMonth}>{fmtMonth(selectedMonth)}</option>}
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {fmtMonth(m)}
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
          <div style={{ flex: 1 }} />
          <div className="lbl" style={{ display: "flex", gap: 16, alignItems: "center", paddingBottom: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, background: "var(--okS)", border: "1px solid var(--ok)" }} />
              Cheapest per origin
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="dash">—</span> no rate
            </span>
          </div>
        </div>

        <div className="tw">
          <table className="tbl" style={{ minWidth: 900 }}>
            <caption className="sr">
              Ocean freight comparison for {selectedDestination}, {fmtMonth(selectedMonth)}, by origin, shipping line and forwarder
            </caption>
            <thead>
              <tr>
                <th rowSpan={2} className="stk" style={{ zIndex: 3, minWidth: 160, verticalAlign: "bottom" }}>
                  Origin
                </th>
                {lineGroups.map((g, i) => (
                  <th key={i} colSpan={g.span} style={{ textAlign: "center", borderLeft: "1px solid var(--line)" }}>
                    {g.shippingLine}
                  </th>
                ))}
              </tr>
              <tr>
                {columns.map(([colKey, c]) => (
                  <th key={colKey} className="r" style={{ top: 37, fontWeight: 500, borderLeft: "1px solid var(--line)" }}>
                    <div style={{ color: "var(--tx)", fontWeight: 600 }}>{c.forwarder_name}</div>
                    {c.free_days !== null && <div className="meta">{c.free_days} free days</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {origins.map(([originKey, originDisplay]) => {
                const cheapestCol = cheapestColKeyForOrigin(originKey);
                return (
                  <tr key={originKey}>
                    <td className="stk" style={{ fontWeight: 600 }}>
                      {originDisplay}
                    </td>
                    {columns.map(([colKey]) => {
                      const v = matrix.get(`${originKey}||${colKey}`);
                      const isCheapest = colKey === cheapestCol && v !== undefined;
                      return (
                        <td
                          key={colKey}
                          className="r num"
                          style={{
                            borderLeft: "1px solid var(--line)",
                            ...(isCheapest ? { background: "var(--okS)", color: "var(--ok)", fontWeight: 700 } : {}),
                          }}
                        >
                          {v === undefined ? (
                            <span className="dash" aria-label="No rate">
                              —
                            </span>
                          ) : isCheapest ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <CheckIcon />${v.toLocaleString()}
                              <span className="sr"> (cheapest)</span>
                            </span>
                          ) : (
                            `$${v.toLocaleString()}`
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {origins.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} style={{ textAlign: "center", padding: "40px 12px", whiteSpace: "normal" }}>
                    <span className="lbl">
                      No rate sheets uploaded yet for {fmtMonth(selectedMonth)} / {selectedDestination}. Click &quot;+ Upload Rate Sheet&quot; to add one.
                    </span>
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
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 18px",
            border: 0,
            background: "transparent",
            color: "var(--tx)",
            font: "inherit",
            cursor: "pointer",
            textAlign: "left",
          }}
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
              <BulkActionBar
                count={bulk.selectedCount}
                itemLabel="rate sheet"
                onDeleteClick={() => setBulkConfirming(true)}
                onClear={bulk.clear}
                deleting={bulkDeleting}
              />
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

// ---------------- Upload panel: PDF (per-file extraction) or manual entry ----------------

type DraftEntry = { origin: string; shipping_line: string; rate: string; free_days: string };

function blankEntry(): DraftEntry {
  return { origin: "", shipping_line: "", rate: "", free_days: "" };
}

function UploadPanel({
  defaultMonth,
  defaultDestination,
  onClose,
  onSaved,
}: {
  defaultMonth: string;
  defaultDestination: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"pdf" | "manual">("pdf");
  const [forwarderName, setForwarderName] = useState("");
  const [destination, setDestination] = useState(defaultDestination);
  const [month, setMonth] = useState(monthToInputValue(defaultMonth));
  const [currency, setCurrency] = useState("USD");
  const [files, setFiles] = useState<File[]>([]);
  const [entries, setEntries] = useState<DraftEntry[]>([blankEntry()]);
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function updateEntry(i: number, patch: Partial<DraftEntry>) {
    setEntries(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function addEntryRow() {
    setEntries([...entries, blankEntry()]);
  }
  function removeEntryRow(i: number) {
    setEntries(entries.filter((_, idx) => idx !== i));
  }

  async function saveManual() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/rate-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forwarder_name: forwarderName,
          destination,
          rate_month: `${month}-01`,
          currency,
          entries: entries.filter((e) => e.origin && e.shipping_line),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save rate sheet");
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Uploads each selected PDF as its own rate sheet (one forwarder's sheet
  // per file is the normal case), sequentially so the log reads top to
  // bottom in upload order.
  async function savePdfs() {
    if (files.length === 0) {
      setError("Choose at least one PDF file.");
      return;
    }
    if (!forwarderName.trim()) {
      setError("Forwarder name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setLog([]);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("forwarder_name", forwarderName);
        form.append("destination", destination);
        form.append("rate_month", `${month}-01`);
        form.append("currency", currency);

        const res = await fetch("/api/rate-sheets", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) {
          setLog((l) => [...l, `✕ ${file.name}: ${json.error || "failed"}`]);
          continue;
        }
        setLog((l) => [...l, `✓ ${file.name}: ${json.entries_found} rates extracted`]);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const pdfMode = mode === "pdf";

  return (
    <section className="card" aria-labelledby="upload-rate-sheet-h" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 id="upload-rate-sheet-h" className="h2">
          Upload rate sheet
        </h2>
        <div className="seg" role="radiogroup" aria-label="Upload method">
          <button type="button" role="radio" aria-checked={pdfMode} className={pdfMode ? "on" : ""} onClick={() => setMode("pdf")}>
            Upload PDF(s)
          </button>
          <button type="button" role="radio" aria-checked={!pdfMode} className={!pdfMode ? "on" : ""} onClick={() => setMode("manual")}>
            Manual Entry (Excel / email source)
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        <div className="field">
          <label htmlFor="rs-fwn">
            Forwarder Name <span className="req">*</span>
          </label>
          <input
            id="rs-fwn"
            className="input"
            placeholder="e.g. UAL, Walker"
            value={forwarderName}
            onChange={(e) => setForwarderName(e.target.value)}
            aria-describedby={error ? "rs-error" : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor="rs-dst">Destination</label>
          <input id="rs-dst" className="input" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rs-rm">Rate Month</label>
          <input id="rs-rm" type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rs-cur">Currency</label>
          <select id="rs-cur" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="INR">INR</option>
          </select>
        </div>
      </div>

      {pdfMode ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="drop" style={{ cursor: "pointer" }}>
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H6v18h12V7zM14 3v4h4M12 11v6M9 14l3-3 3 3" />
            </svg>
            <span style={{ fontWeight: 600 }}>Choose one or more rate-sheet PDFs</span>
            {files.length > 0 && <span className="meta">{files.length} file{files.length === 1 ? "" : "s"} selected</span>}
            <input type="file" accept="application/pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} className="sr" />
          </label>
          <p className="help" style={{ margin: 0 }}>
            Each PDF becomes its own rate sheet under this forwarder/month/destination. AI extraction reads every origin+carrier rate cell —
            review the comparison table afterward and fix anything it misread under &quot;Manage uploaded rate sheets&quot; below.
          </p>
          {log.length > 0 && (
            <div
              role="log"
              aria-label="Extraction log"
              style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, fontSize: 13, background: "var(--surf2)" }}
            >
              {log.map((l, i) => (
                <span key={i} style={l.startsWith("✓") ? { color: "var(--ok)", fontWeight: 500 } : l.startsWith("✕") ? { color: "var(--crit)", fontWeight: 500 } : { color: "var(--tx2)" }}>
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", fontWeight: 600, background: "var(--surf2)", borderBottom: "1px solid var(--line)" }}>Rate Rows</div>
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
                {entries.map((e, i) => (
                  <tr key={i}>
                    <td>
                      <input className="input input-s" aria-label={`Origin row ${i + 1}`} value={e.origin} onChange={(ev) => updateEntry(i, { origin: ev.target.value })} />
                    </td>
                    <td>
                      <input
                        className="input input-s"
                        aria-label={`Shipping line row ${i + 1}`}
                        value={e.shipping_line}
                        onChange={(ev) => updateEntry(i, { shipping_line: ev.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="input input-s num"
                        style={{ textAlign: "right" }}
                        aria-label={`Rate row ${i + 1}`}
                        value={e.rate}
                        onChange={(ev) => updateEntry(i, { rate: ev.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="input input-s num"
                        style={{ textAlign: "right" }}
                        aria-label={`Free days row ${i + 1}`}
                        value={e.free_days}
                        onChange={(ev) => updateEntry(i, { free_days: ev.target.value })}
                      />
                    </td>
                    <td className="r">
                      {entries.length > 1 && (
                        <button type="button" className="ib" aria-label={`Remove row ${i + 1}`} onClick={() => removeEntryRow(i)}>
                          <RemoveIcon />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 14px" }}>
            <button type="button" className="btn btn-s" onClick={addEntryRow}>
              + Add Row
            </button>
          </div>
        </div>
      )}

      {error && (
        <p id="rs-error" className="err" style={{ margin: 0 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-p" onClick={mode === "pdf" ? savePdfs : saveManual} disabled={saving}>
          {saving ? "Saving…" : "Save Rate Sheet"}
        </button>
      </div>
    </section>
  );
}

// ---------------- Manage panel: one card per uploaded sheet, editable rows ----------------

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

  const sourceLabel = sheet.source_type === "pdf" ? sheet.source_file_name : "manual entry";

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
