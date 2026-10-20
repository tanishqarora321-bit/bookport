"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ColumnDef, formatValue, sumColumn } from "@/lib/offer-sheet-compute";
import { CheckIcon, CloseIcon } from "@/components/EditableCell";

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
    <div className="flex flex-col" style={{ gap: 20 }}>
      <section className="card" aria-labelledby="gt" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 18px 12px", display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--line)" }}>
          <Link href="/offer-sheets" style={{ fontSize: 13, width: "fit-content" }}>
            ← Back to Offer Sheet
          </Link>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
            <div>
              <h2 id="gt" style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>{sheetTitle}</h2>
              <div className="lbl" style={{ marginTop: 2 }}>{sectionName}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setSettingsOpen(!settingsOpen)} className="btn btn-s">
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4" />
                </svg>
                Sheet Settings
              </button>
              <button onClick={exportCsv} className="btn btn-s">Export CSV</button>
              {hasGrouping ? (
                <button onClick={() => setAddingGroup(true)} className="btn btn-s btn-p">+ New Group</button>
              ) : (
                <button onClick={() => addRow(null)} className="btn btn-s btn-p">+ Add Row</button>
              )}
            </div>
          </div>
        </div>

        <div className="tw">
          <table className="tbl" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                {visibleColumns.map((c) => (
                  <th key={c.key} className={c.kind === "number" || c.kind === "computed" ? "r" : undefined}>
                    {c.label}
                    {c.kind === "computed" && <span className="fx" aria-label="computed">ƒx</span>}
                  </th>
                ))}
                <th><span className="sr">Delete</span></th>
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
                  <td colSpan={visibleColumns.length + 1} className="meta" style={{ textAlign: "center", padding: "40px 12px" }}>
                    No rows yet. Click &quot;{hasGrouping ? "+ New Group" : "+ Add Row"}&quot; to start entering costs.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  {visibleColumns.map((c, i) => (
                    <td key={c.key} className={c.kind === "number" || c.kind === "computed" ? "r" : undefined}>
                      {i === 0 ? "GRAND TOTAL" : c.kind === "number" || c.kind === "computed" ? formatValue(c, sumColumn(rows, c.key)) : ""}
                    </td>
                  ))}
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="meta" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", borderTop: "1px solid var(--line)" }}>
          <span className="fx" aria-hidden="true">ƒx</span> Computed columns are read-only. Hover a column header to see its formula.
        </div>
      </section>

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
      {onAddItem && (
        <tr className="gh">
          <td colSpan={visibleColumns.length}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {groupRows[0].group_key && <span className="mono meta">{groupRows[0].group_key}</span>}
            </span>
          </td>
          <td className="r">
            <button onClick={onAddItem} className="btn btn-xs">+ Add Item to This Group</button>
          </td>
        </tr>
      )}
      {groupRows.map((row, i) => (
        <tr key={row.id}>
          {visibleColumns.map((c) => {
            const isGroupScoped = c.scope === "group";
            const showEditable = c.kind !== "computed" && (!isGroupScoped || i === 0);
            const isNum = c.kind === "number" || c.kind === "computed";
            if (!showEditable) {
              return (
                <td key={c.key} className={`${isNum ? "r num" : ""}${c.kind === "computed" ? " cmp" : ""}`}>
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
          <td className="r">
            <button onClick={() => onDeleteRow(row.id)} aria-label={`Delete row ${i + 1}`} className="ib" style={{ color: "var(--crit)" }}>
              <CloseIcon />
            </button>
          </td>
        </tr>
      ))}
      {showGroupTotal && (
        <tr className="gs">
          {visibleColumns.map((c, i) => (
            <td key={c.key} className={c.kind === "number" || c.kind === "computed" ? "r num" : undefined}>
              {i === 0 ? "Group subtotal" : numericColumns.includes(c) ? formatValue(c, sumColumn(groupRows, c.key)) : ""}
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

  const isNum = column.kind === "number";

  if (!editing) {
    return (
      <td className={isNum ? "r num" : undefined}>
        <span onClick={() => setEditing(true)} style={{ cursor: "text", display: "block", borderRadius: 6, padding: "0 4px", margin: "0 -4px" }}>
          {formatValue(column, value)}
        </span>
      </td>
    );
  }

  return (
    <td className={isNum ? "r" : undefined}>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <input
          autoFocus
          type={column.kind === "date" ? "date" : column.kind === "number" ? "number" : "text"}
          step={column.kind === "number" ? "any" : undefined}
          className="input input-s"
          style={{ width: 110, borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accentS)" }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} aria-label="Save" className="ib" style={{ background: "var(--accent)", color: "var(--onAccent)" }}>
          <CheckIcon />
        </button>
        <button onClick={() => setEditing(false)} aria-label="Cancel" className="ib">
          <CloseIcon />
        </button>
        {error && <span className="err">{error}</span>}
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
    <section className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <p className="lbl" style={{ margin: 0 }}>
        New shipment/load — fill the shared fields plus its first item. Use &quot;+ Add Item to This Group&quot; afterward for more items in the
        same shipment.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {inputColumns.map((c) => (
          <div key={c.key} className="field">
            <label htmlFor={`newgroup-${c.key}`}>{c.label}</label>
            <input
              id={`newgroup-${c.key}`}
              type={c.kind === "date" ? "date" : c.kind === "number" ? "number" : "text"}
              className="input"
              value={form[c.key]}
              onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={save} disabled={saving} className="btn btn-p">
          {saving ? "Saving…" : "Create"}
        </button>
        <button onClick={onClose} className="btn">
          Cancel
        </button>
      </div>
    </section>
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
    <aside className="card" aria-labelledby="ss" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, maxWidth: 360 }}>
      <h2 id="ss" className="h2">Sheet Settings</h2>
      <p className="lbl" style={{ margin: 0 }}>
        Constants used by this section&apos;s formulas (as <span className="mono">sheet:</span> values).
      </p>
      {neededKeys.length === 0 ? (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div className="meta" style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 6 }}>
            When no constants are used
          </div>
          <p className="lbl" style={{ margin: 0 }}>This section&apos;s formulas don&apos;t use any sheet-level constants.</p>
        </div>
      ) : (
        neededKeys.map((key) => (
          <div key={key} className="field">
            <label htmlFor={`setting-${key}`}>{key}</label>
            <input
              id={`setting-${key}`}
              className="input num"
              value={vals[key]}
              onChange={(e) => setVals({ ...vals, [key]: e.target.value })}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => save(key)} disabled={saving === key} className="btn btn-s btn-p">
                {saving === key ? "…" : "Save"}
              </button>
            </div>
          </div>
        ))
      )}
      <button onClick={onClose} className="btn btn-s">
        Close
      </button>
    </aside>
  );
}
