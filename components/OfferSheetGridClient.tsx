"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ColumnDef, formatValue, sumColumn } from "@/lib/offer-sheet-compute";

type Row = { id: string; group_key: string | null; sort_order: number; [key: string]: any };

function newGroupKey() {
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function OfferSheetGridClient({
  sheetId,
  sheetTitle,
  sectionName,
  period,
  settings,
  columns,
  initialRows,
}: {
  sheetId: string;
  sheetTitle: string;
  sectionName: string;
  period: string | null;
  settings: Record<string, any>;
  columns: ColumnDef[];
  initialRows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [sheetSettings, setSheetSettings] = useState(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);

  const visibleColumns = useMemo(() => columns.filter((c) => !c.hidden), [columns]);
  const hasGrouping = useMemo(() => columns.some((c) => c.scope === "group"), [columns]);
  const numericColumns = useMemo(() => visibleColumns.filter((c) => c.kind === "number" || c.kind === "computed"), [visibleColumns]);

  // Preserve group ordering: group_key (or the row's own id if ungrouped) -> ordered rows
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    const order: string[] = [];
    for (const r of [...rows].sort((a, b) => a.sort_order - b.sort_order)) {
      const key = r.group_key ?? `__row_${r.id}`;
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(r);
    }
    return order.map((key) => ({ key, rows: map.get(key)! }));
  }, [rows]);

  function mergeComputed(computedRows: Row[]) {
    setRows((prev) => {
      const byId = new Map(prev.map((r) => [r.id, r]));
      for (const cr of computedRows) {
        const existing = byId.get(cr.id);
        byId.set(cr.id, { ...(existing ?? { sort_order: 0 }), ...cr, sort_order: existing?.sort_order ?? 0 });
      }
      return Array.from(byId.values());
    });
  }

  async function patchCell(rowId: string, key: string, value: string) {
    const res = await fetch(`/api/offer-sheets/${sheetId}/rows/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Save failed");
    mergeComputed(json.computed_rows);
  }

  async function addRow(groupKey: string | null, extraRowData: Record<string, any> = {}) {
    const res = await fetch(`/api/offer-sheets/${sheetId}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_key: groupKey, row_data: extraRowData }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to add row");
    setRows((prev) => [...prev, { ...json.row, ...json.row.row_data, sort_order: prev.length }]);
    mergeComputed(json.computed_rows);
  }

  async function deleteRow(rowId: string) {
    if (!confirm("Delete this row?")) return;
    const res = await fetch(`/api/offer-sheets/${sheetId}/rows/${rowId}`, { method: "DELETE" });
    if (res.ok) setRows((prev) => prev.filter((r) => r.id !== rowId));
  }

  async function saveSetting(key: string, value: string) {
    const next = { ...sheetSettings, [key]: value };
    const res = await fetch(`/api/offer-sheets/${sheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: next }),
    });
    if (res.ok) {
      setSheetSettings(next);
      // Sheet-level settings (e.g. fx_rate) feed every row's computed
      // columns, so a change here needs every row recomputed -- simplest
      // correct move is a full reload rather than patching client state.
      window.location.reload();
    }
  }

  function exportCsv() {
    const header = visibleColumns.map((c) => c.label);
    const csvRows = groups.flatMap(({ rows: groupRows }) =>
      groupRows.map((r) => visibleColumns.map((c) => (r[c.key] ?? "").toString()))
    );
    const csv = [header, ...csvRows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sheetTitle.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full flex flex-col">
      <Link href="/offer-sheets" className="text-sm text-accent mb-2 w-fit">
        ← Back to Offer Sheet
      </Link>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink">{sheetTitle}</h1>
          <p className="text-xs text-ink/50">{sectionName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSettingsOpen(!settingsOpen)} className="text-sm border px-3 py-1.5 rounded">
            ⚙ Sheet Settings
          </button>
          <button onClick={exportCsv} className="text-sm border px-3 py-1.5 rounded">
            ⬇ Export CSV
          </button>
          {hasGrouping ? (
            <button onClick={() => setAddingGroup(true)} className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium">
              + New Group
            </button>
          ) : (
            <button onClick={() => addRow(null)} className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium">
              + Add Row
            </button>
          )}
        </div>
      </div>

      {settingsOpen && (
        <SettingsPanel columns={columns} settings={sheetSettings} onSave={saveSetting} onClose={() => setSettingsOpen(false)} />
      )}

      {addingGroup && (
        <NewGroupPanel
          columns={columns}
          onClose={() => setAddingGroup(false)}
          onCreate={async (rowData) => {
            await addRow(newGroupKey(), rowData);
            setAddingGroup(false);
          }}
        />
      )}

      <div className="flex-1 overflow-auto border rounded">
        <table className="text-sm border-collapse min-w-max">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="text-left text-ink/50 border-b">
              {visibleColumns.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ key, rows: groupRows }) => (
              <GroupBlock
                key={key}
                groupRows={groupRows}
                visibleColumns={visibleColumns}
                numericColumns={numericColumns}
                showGroupTotal={groupRows.length > 1 || hasGrouping}
                onCellSave={patchCell}
                onDeleteRow={deleteRow}
                onAddItem={groupRows[0].group_key ? () => addRow(groupRows[0].group_key) : undefined}
              />
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-3 py-10 text-center text-ink/40">
                  No rows yet. Click "{hasGrouping ? "+ New Group" : "+ Add Row"}" to start entering costs.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 font-semibold bg-slate-50">
                {visibleColumns.map((c, i) => (
                  <td key={c.key} className="px-3 py-2 whitespace-nowrap">
                    {i === 0 ? "GRAND TOTAL" : c.kind === "number" || c.kind === "computed" ? formatValue(c, sumColumn(rows, c.key)) : ""}
                  </td>
                ))}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ---------------- One group's rows + its subtotal footer ----------------

function GroupBlock({
  groupRows,
  visibleColumns,
  numericColumns,
  showGroupTotal,
  onCellSave,
  onDeleteRow,
  onAddItem,
}: {
  groupRows: Row[];
  visibleColumns: ColumnDef[];
  numericColumns: ColumnDef[];
  showGroupTotal: boolean;
  onCellSave: (rowId: string, key: string, value: string) => Promise<void>;
  onDeleteRow: (rowId: string) => void;
  onAddItem?: () => void;
}) {
  return (
    <>
      {groupRows.map((row, i) => (
        <tr key={row.id} className="border-b hover:bg-blue-50/20">
          {visibleColumns.map((c) => {
            const isGroupScoped = c.scope === "group";
            const showEditable = c.kind !== "computed" && (!isGroupScoped || i === 0);
            if (!showEditable) {
              return (
                <td key={c.key} className="px-3 py-2 whitespace-nowrap text-ink/40">
                  {c.kind === "computed" ? formatValue(c, row[c.key]) : isGroupScoped ? "" : formatValue(c, row[c.key])}
                </td>
              );
            }
            return (
              <EditableCell
                key={c.key}
                value={row[c.key]}
                column={c}
                onSave={(v) => onCellSave(row.id, c.key, v)}
              />
            );
          })}
          <td className="px-3 py-2">
            <button onClick={() => onDeleteRow(row.id)} className="text-cutoff text-xs">
              ✕
            </button>
          </td>
        </tr>
      ))}
      {onAddItem && (
        <tr className="border-b bg-slate-50/40">
          <td colSpan={visibleColumns.length + 1} className="px-3 py-1">
            <button onClick={onAddItem} className="text-xs text-accent underline">
              + Add Item to This Group
            </button>
          </td>
        </tr>
      )}
      {showGroupTotal && (
        <tr className="border-b bg-slate-50 text-xs font-medium text-ink/60">
          {visibleColumns.map((c, i) => (
            <td key={c.key} className="px-3 py-1 whitespace-nowrap">
              {i === 0 ? "Subtotal" : numericColumns.includes(c) ? formatValue(c, sumColumn(groupRows, c.key)) : ""}
            </td>
          ))}
          <td></td>
        </tr>
      )}
    </>
  );
}

// ---------------- Editable cell ----------------

function EditableCell({
  value,
  column,
  onSave,
}: {
  value: any;
  column: ColumnDef;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(val);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <td className="px-3 py-2 whitespace-nowrap">
        <span onClick={() => setEditing(true)} className="cursor-text hover:bg-blue-50 px-1 rounded block">
          {formatValue(column, value)}
        </span>
      </td>
    );
  }

  return (
    <td className="px-3 py-2 whitespace-nowrap">
      <div className="flex gap-1 items-center">
        <input
          autoFocus
          type={column.kind === "date" ? "date" : column.kind === "number" ? "number" : "text"}
          step={column.kind === "number" ? "any" : undefined}
          className="border border-accent rounded px-1.5 py-0.5 text-sm w-28"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="text-xs bg-ink text-white px-1.5 py-0.5 rounded">
          {saving ? "…" : "✓"}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs border px-1.5 py-0.5 rounded">
          ✕
        </button>
        {error && <span className="text-xs text-cutoff">{error}</span>}
      </div>
    </td>
  );
}

// ---------------- New Group panel: fill the group-scoped fields once, plus the first item ----------------

function NewGroupPanel({
  columns,
  onClose,
  onCreate,
}: {
  columns: ColumnDef[];
  onClose: () => void;
  onCreate: (rowData: Record<string, any>) => Promise<void>;
}) {
  const inputColumns = columns.filter((c) => c.kind !== "computed" && !c.hidden);
  const [form, setForm] = useState<Record<string, string>>(Object.fromEntries(inputColumns.map((c) => [c.key, ""])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onCreate(form);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-accent/30 bg-accent/5 rounded p-4 mb-4">
      <div className="text-xs font-medium text-ink/60 mb-2">
        New shipment/load — fill the shared fields plus its first item. Use "+ Add Item to This Group" afterward for more items in the
        same shipment.
      </div>
      <div className="grid grid-cols-4 gap-3">
        {inputColumns.map((c) => (
          <div key={c.key}>
            <div className="text-xs text-ink/40 mb-0.5">{c.label}</div>
            <input
              type={c.kind === "date" ? "date" : c.kind === "number" ? "number" : "text"}
              className="border rounded px-2 py-1 text-sm w-full"
              value={form[c.key]}
              onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      {error && <div className="text-xs text-cutoff mt-3">{error}</div>}
      <div className="flex gap-2 mt-3">
        <button onClick={save} disabled={saving} className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium disabled:opacity-50">
          {saving ? "Saving…" : "Create"}
        </button>
        <button onClick={onClose} className="text-sm border px-3 py-1.5 rounded">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------- Sheet-level settings (e.g. Mixed Rags' fx_rate) ----------------

function SettingsPanel({
  columns,
  settings,
  onSave,
  onClose,
}: {
  columns: ColumnDef[];
  settings: Record<string, any>;
  onSave: (key: string, value: string) => Promise<void>;
  onClose: () => void;
}) {
  // Discover which "sheet:<key>" constants this type's formulas actually use,
  // so the panel only asks for settings that matter instead of an open-ended
  // key-value editor.
  const neededKeys = Array.from(
    new Set(
      columns
        .flatMap((c) => c.compute?.args ?? [])
        .filter((a) => a.startsWith("sheet:"))
        .map((a) => a.slice("sheet:".length))
    )
  );

  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(neededKeys.map((k) => [k, settings[k]?.toString() ?? ""])));
  const [saving, setSaving] = useState<string | null>(null);

  async function save(key: string) {
    setSaving(key);
    await onSave(key, vals[key]);
    setSaving(null);
  }

  return (
    <div className="border border-accent/30 bg-accent/5 rounded p-4 mb-4">
      <div className="text-xs font-medium text-ink/60 mb-2">Sheet Settings</div>
      {neededKeys.length === 0 ? (
        <p className="text-xs text-ink/40">This section's formulas don't use any sheet-level constants.</p>
      ) : (
        <div className="flex gap-3 flex-wrap">
          {neededKeys.map((key) => (
            <div key={key} className="flex items-end gap-2">
              <div>
                <div className="text-xs text-ink/40 mb-0.5">{key}</div>
                <input
                  className="border rounded px-2 py-1 text-sm w-28"
                  value={vals[key]}
                  onChange={(e) => setVals({ ...vals, [key]: e.target.value })}
                />
              </div>
              <button onClick={() => save(key)} disabled={saving === key} className="text-xs bg-ink text-white px-2 py-1 rounded">
                {saving === key ? "…" : "Save"}
              </button>
            </div>
          ))}
        </div>
      )}
      <button onClick={onClose} className="text-xs border px-2 py-1 rounded mt-3">
        Close
      </button>
    </div>
  );
}
