"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

export default function FreightComparisonClient({
  monthOptions,
  destinationOptions,
  selectedMonth,
  selectedDestination,
  initialSheets,
}: {
  monthOptions: string[];
  destinationOptions: string[];
  selectedMonth: string;
  selectedDestination: string;
  initialSheets: RateSheet[];
}) {
  const router = useRouter();
  const [sheets, setSheets] = useState(initialSheets);
  const [uploading, setUploading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  function navigate(month: string, destination: string) {
    router.push(`/freight-comparison?month=${encodeURIComponent(month)}&destination=${encodeURIComponent(destination)}`);
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
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink">Freight Comparison</h1>
          <p className="text-xs text-ink/50">{fmtMonth(selectedMonth)} — {selectedDestination}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-2 py-1.5 text-sm"
            value={selectedMonth}
            onChange={(e) => navigate(e.target.value, selectedDestination)}
          >
            {!monthOptions.includes(selectedMonth) && <option value={selectedMonth}>{fmtMonth(selectedMonth)}</option>}
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {fmtMonth(m)}
              </option>
            ))}
          </select>
          <select
            className="border rounded px-2 py-1.5 text-sm"
            value={selectedDestination}
            onChange={(e) => navigate(selectedMonth, e.target.value)}
          >
            {!destinationOptions.includes(selectedDestination) && <option value={selectedDestination}>{selectedDestination}</option>}
            {destinationOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button onClick={exportCsv} disabled={origins.length === 0} className="text-sm border px-3 py-1.5 rounded disabled:opacity-40">
            ⬇ Export CSV
          </button>
          <button onClick={() => setUploading(true)} className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium">
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

      <div className="flex-1 overflow-auto border rounded mb-4">
        <table className="text-sm border-collapse min-w-max">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="text-left text-ink/50 border-b">
              <th className="px-3 py-2 font-medium sticky left-0 bg-slate-50 z-20">Origin</th>
              {columns.map(([colKey, c]) => (
                <th key={colKey} className="px-3 py-2 font-medium whitespace-nowrap text-center">
                  <div>{c.shipping_line}</div>
                  <div className="text-[11px] text-ink/40 font-normal">{c.forwarder_name}</div>
                  {c.free_days !== null && <div className="text-[10px] text-accent font-normal">{c.free_days} free days</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {origins.map(([originKey, originDisplay]) => {
              const cheapestCol = cheapestColKeyForOrigin(originKey);
              return (
                <tr key={originKey} className="border-b hover:bg-blue-50/20">
                  <td className="px-3 py-2 font-medium whitespace-nowrap sticky left-0 bg-white">{originDisplay}</td>
                  {columns.map(([colKey]) => {
                    const v = matrix.get(`${originKey}||${colKey}`);
                    const isCheapest = colKey === cheapestCol && v !== undefined;
                    return (
                      <td
                        key={colKey}
                        className={`px-3 py-2 text-center whitespace-nowrap ${
                          isCheapest ? "bg-green-100 text-green-800 font-semibold" : "text-ink/70"
                        }`}
                      >
                        {v !== undefined ? `$${v.toLocaleString()}` : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {origins.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-10 text-center text-ink/40">
                  No rate sheets uploaded yet for {fmtMonth(selectedMonth)} / {selectedDestination}. Click "+ Upload Rate Sheet" to add one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <button onClick={() => setManageOpen(!manageOpen)} className="text-xs text-accent underline mb-2">
          {manageOpen ? "Hide" : "Manage"} uploaded rate sheets ({sheets.length})
        </button>
        {manageOpen && (
          <div className="space-y-3">
            {sheets.map((s) => (
              <SheetManageCard
                key={s.id}
                sheet={s}
                onDeleted={() => {
                  setSheets(sheets.filter((x) => x.id !== s.id));
                  router.refresh();
                }}
                onChanged={() => router.refresh()}
              />
            ))}
            {sheets.length === 0 && <p className="text-xs text-ink/40">No sheets for this month/destination yet.</p>}
          </div>
        )}
      </div>
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

  return (
    <div className="border border-accent/30 bg-accent/5 rounded p-4 mb-4">
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setMode("pdf")}
          className={`text-xs px-3 py-1 rounded ${mode === "pdf" ? "bg-ink text-white" : "border"}`}
        >
          Upload PDF(s)
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`text-xs px-3 py-1 rounded ${mode === "manual" ? "bg-ink text-white" : "border"}`}
        >
          Manual Entry (Excel / email source)
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div>
          <div className="text-xs text-ink/40 mb-0.5">Forwarder Name *</div>
          <input className="border rounded px-2 py-1 text-sm w-full" value={forwarderName} onChange={(e) => setForwarderName(e.target.value)} placeholder="e.g. UAL, Walker" />
        </div>
        <div>
          <div className="text-xs text-ink/40 mb-0.5">Destination</div>
          <input className="border rounded px-2 py-1 text-sm w-full" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-ink/40 mb-0.5">Rate Month</div>
          <input type="month" className="border rounded px-2 py-1 text-sm w-full" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-ink/40 mb-0.5">Currency</div>
          <select className="border rounded px-2 py-1 text-sm w-full" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="INR">INR</option>
          </select>
        </div>
      </div>

      {mode === "pdf" ? (
        <div>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="text-sm mb-2"
          />
          <p className="text-xs text-ink/40 mb-2">
            Each PDF becomes its own rate sheet under this forwarder/month/destination. AI extraction reads every
            origin+carrier rate cell — review the comparison table afterward and fix anything it misread under "Manage
            uploaded rate sheets" below.
          </p>
          {log.length > 0 && (
            <div className="text-xs bg-white border rounded p-2 mb-2 space-y-0.5">
              {log.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="border-t pt-3">
          <div className="text-xs font-medium text-ink/60 mb-2">Rate Rows</div>
          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="text-left text-ink/40">
                <th className="pb-1 pr-2 font-normal">Origin</th>
                <th className="pb-1 pr-2 font-normal">Shipping Line</th>
                <th className="pb-1 pr-2 font-normal w-24">Rate</th>
                <th className="pb-1 pr-2 font-normal w-24">Free Days</th>
                <th className="pb-1 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td className="pr-2 pb-1">
                    <input className="border rounded px-2 py-1 text-sm w-full" value={e.origin} onChange={(ev) => updateEntry(i, { origin: ev.target.value })} />
                  </td>
                  <td className="pr-2 pb-1">
                    <input className="border rounded px-2 py-1 text-sm w-full" value={e.shipping_line} onChange={(ev) => updateEntry(i, { shipping_line: ev.target.value })} />
                  </td>
                  <td className="pr-2 pb-1">
                    <input type="number" className="border rounded px-2 py-1 text-sm w-full" value={e.rate} onChange={(ev) => updateEntry(i, { rate: ev.target.value })} />
                  </td>
                  <td className="pr-2 pb-1">
                    <input type="number" className="border rounded px-2 py-1 text-sm w-full" value={e.free_days} onChange={(ev) => updateEntry(i, { free_days: ev.target.value })} />
                  </td>
                  <td className="pb-1 text-center">
                    {entries.length > 1 && (
                      <button onClick={() => removeEntryRow(i)} className="text-cutoff text-xs">
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addEntryRow} className="text-xs text-accent underline">
            + Add Row
          </button>
        </div>
      )}

      {error && <div className="text-xs text-cutoff mt-3">{error}</div>}

      <div className="flex gap-2 mt-3">
        <button
          onClick={mode === "pdf" ? savePdfs : saveManual}
          disabled={saving}
          className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Rate Sheet"}
        </button>
        <button onClick={onClose} className="text-sm border px-3 py-1.5 rounded">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------- Manage panel: one card per uploaded sheet, editable rows ----------------

function SheetManageCard({
  sheet,
  onDeleted,
  onChanged,
}: {
  sheet: RateSheet;
  onDeleted: () => void;
  onChanged: () => void;
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

  return (
    <div className="border rounded">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
        <button onClick={() => setOpen(!open)} className="text-sm font-medium text-left flex-1">
          {sheet.forwarder_name} <span className="text-ink/40 font-normal">— {rows.length} rates — {sheet.source_type === "pdf" ? sheet.source_file_name : "manual entry"}</span>
        </button>
        <button onClick={deleteSheet} disabled={deleting} className="text-xs text-cutoff hover:bg-red-50 px-2 py-1 rounded">
          {deleting ? "…" : "Delete Sheet"}
        </button>
      </div>
      {open && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink/40 border-t">
              <th className="px-3 py-1 font-normal">Origin</th>
              <th className="px-3 py-1 font-normal">Shipping Line</th>
              <th className="px-3 py-1 font-normal w-24">Rate</th>
              <th className="px-3 py-1 font-normal w-24">Free Days</th>
              <th className="px-3 py-1 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <RowCell value={r.origin} onSave={(v) => patchEntry(r.id, "origin", v)} />
                <RowCell value={r.shipping_line} onSave={(v) => patchEntry(r.id, "shipping_line", v)} />
                <RowCell value={r.rate?.toString() ?? ""} isNumber onSave={(v) => patchEntry(r.id, "rate", v)} />
                <RowCell value={r.free_days?.toString() ?? ""} isNumber onSave={(v) => patchEntry(r.id, "free_days", v)} />
                <td className="px-3 py-1 text-center">
                  <button onClick={() => deleteEntry(r.id)} className="text-cutoff text-xs">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-2 text-ink/40 text-xs">
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
      <td className="px-3 py-1">
        <span onClick={() => setEditing(true)} className="cursor-text hover:bg-blue-50 px-1 rounded block">
          {value || "—"}
        </span>
      </td>
    );
  }

  return (
    <td className="px-3 py-1">
      <div className="flex gap-1 items-center">
        <input
          autoFocus
          type={isNumber ? "number" : "text"}
          className="border border-accent rounded px-1.5 py-0.5 text-sm w-full"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="text-xs bg-ink text-white px-1.5 py-0.5 rounded">
          {saving ? "…" : "✓"}
        </button>
      </div>
    </td>
  );
}
