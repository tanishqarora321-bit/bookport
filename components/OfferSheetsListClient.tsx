"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ColumnDef = { key: string; label: string; kind: string; hidden?: boolean };
type OfferSheetType = { id: string; name: string; columns: ColumnDef[]; created_at: string };
type Sheet = { id: string; title: string; period: string | null; notes: string | null; created_at: string; row_count: number };

function fmtPeriod(p: string | null) {
  if (!p) return "—";
  return new Date(p + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function OfferSheetsListClient({
  types,
  selectedTypeId,
  sheets,
}: {
  types: OfferSheetType[];
  selectedTypeId: string | null;
  sheets: Sheet[];
}) {
  const router = useRouter();
  const [creatingSection, setCreatingSection] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">Offer Sheet</h1>
        <button onClick={() => setCreatingSection(true)} className="text-sm border px-3 py-1.5 rounded">
          + New Section
        </button>
      </div>

      <div className="flex gap-1 border-b mb-4 flex-wrap">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => router.push(`/offer-sheets?type=${t.id}`)}
            className={`text-sm px-3 py-2 -mb-px border-b-2 ${
              t.id === selectedTypeId ? "border-accent text-accent font-medium" : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {t.name}
          </button>
        ))}
        {types.length === 0 && <p className="text-sm text-ink/40 py-2">No sections yet — click "+ New Section" to create one.</p>}
      </div>

      {creatingSection && (
        <NewSectionPanel
          onClose={() => setCreatingSection(false)}
          onCreated={(t) => {
            setCreatingSection(false);
            router.push(`/offer-sheets?type=${t.id}`);
            router.refresh();
          }}
        />
      )}

      {selectedTypeId && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink/60">Sheets in this section</h2>
            <button onClick={() => setCreatingSheet(true)} className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium">
              + New Sheet
            </button>
          </div>

          {creatingSheet && (
            <NewSheetPanel
              offerSheetTypeId={selectedTypeId}
              onClose={() => setCreatingSheet(false)}
              onCreated={(sheet) => router.push(`/offer-sheets/sheet/${sheet.id}`)}
            />
          )}

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink/50 border-b">
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Rows</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sheets.map((s) => (
                <tr key={s.id} className="border-b hover:bg-blue-50/40">
                  <td className="px-3 py-2 font-medium">{s.title}</td>
                  <td className="px-3 py-2 text-ink/60">{fmtPeriod(s.period)}</td>
                  <td className="px-3 py-2 text-ink/60">{s.row_count}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/offer-sheets/sheet/${s.id}`} className="text-xs text-accent underline">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
              {sheets.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-ink/40">
                    No sheets yet in this section. Click "+ New Sheet" to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ---------------- New Section: simple column builder (text/number/date only) ----------------
// Computed columns (formulas) aren't editable from this UI yet -- adding a
// section that needs them (like Mixed Rags/Bed Sheet/Wiper's cost math)
// means adding a migration the same way those three were seeded, since a
// formula builder UI is more than this first version needs. Plain
// text/number/date sections work end-to-end from here though.

type DraftColumn = { key: string; label: string; kind: "text" | "number" | "date" };

function blankColumn(): DraftColumn {
  return { key: "", label: "", kind: "text" };
}

function NewSectionPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: OfferSheetType) => void;
}) {
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<DraftColumn[]>([blankColumn()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateColumn(i: number, patch: Partial<DraftColumn>) {
    setColumns(columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addColumn() {
    setColumns([...columns, blankColumn()]);
  }
  function removeColumn(i: number) {
    setColumns(columns.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!name.trim()) {
      setError("Section name is required.");
      return;
    }
    const cleanColumns = columns
      .filter((c) => c.key.trim() && c.label.trim())
      .map((c) => ({ key: c.key.trim().toLowerCase().replace(/\s+/g, "_"), label: c.label.trim(), kind: c.kind }));
    if (cleanColumns.length === 0) {
      setError("Add at least one column.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/offer-sheet-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, columns: cleanColumns }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create section");
      onCreated(json.offer_sheet_type);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-accent/30 bg-accent/5 rounded p-4 mb-4">
      <div className="mb-3">
        <div className="text-xs text-ink/40 mb-0.5">Section Name *</div>
        <input className="border rounded px-2 py-1.5 text-sm w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Partly Offer Sheet" />
      </div>

      <div className="text-xs font-medium text-ink/60 mb-2">Columns</div>
      <table className="w-full text-sm mb-2">
        <thead>
          <tr className="text-left text-ink/40">
            <th className="pb-1 pr-2 font-normal">Column Key</th>
            <th className="pb-1 pr-2 font-normal">Label</th>
            <th className="pb-1 pr-2 font-normal w-28">Type</th>
            <th className="pb-1 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {columns.map((c, i) => (
            <tr key={i}>
              <td className="pr-2 pb-1">
                <input className="border rounded px-2 py-1 text-sm w-full" value={c.key} onChange={(e) => updateColumn(i, { key: e.target.value })} placeholder="e.g. weight" />
              </td>
              <td className="pr-2 pb-1">
                <input className="border rounded px-2 py-1 text-sm w-full" value={c.label} onChange={(e) => updateColumn(i, { label: e.target.value })} placeholder="e.g. Weight (lbs)" />
              </td>
              <td className="pr-2 pb-1">
                <select className="border rounded px-2 py-1 text-sm w-full" value={c.kind} onChange={(e) => updateColumn(i, { kind: e.target.value as any })}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </select>
              </td>
              <td className="pb-1 text-center">
                {columns.length > 1 && (
                  <button onClick={() => removeColumn(i)} className="text-cutoff text-xs">
                    ✕
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addColumn} className="text-xs text-accent underline">
        + Add Column
      </button>

      {error && <div className="text-xs text-cutoff mt-3">{error}</div>}

      <div className="flex gap-2 mt-3">
        <button onClick={save} disabled={saving} className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium disabled:opacity-50">
          {saving ? "Saving…" : "Create Section"}
        </button>
        <button onClick={onClose} className="text-sm border px-3 py-1.5 rounded">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------- New Sheet: title + optional period ----------------

function NewSheetPanel({
  offerSheetTypeId,
  onClose,
  onCreated,
}: {
  offerSheetTypeId: string;
  onClose: () => void;
  onCreated: (s: { id: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/offer-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer_sheet_type_id: offerSheetTypeId,
          title,
          period: period ? `${period}-01` : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create sheet");
      onCreated(json.offer_sheet);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-accent/30 bg-accent/5 rounded p-4 mb-4 grid grid-cols-2 gap-3">
      <div>
        <div className="text-xs text-ink/40 mb-0.5">Title *</div>
        <input className="border rounded px-2 py-1.5 text-sm w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. August 2026 Mixed Rags" />
      </div>
      <div>
        <div className="text-xs text-ink/40 mb-0.5">Period (optional)</div>
        <input type="month" className="border rounded px-2 py-1.5 text-sm w-full" value={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>
      {error && <div className="col-span-2 text-xs text-cutoff">{error}</div>}
      <div className="col-span-2 flex gap-2">
        <button onClick={save} disabled={saving} className="text-sm bg-ink text-white px-3 py-1.5 rounded">
          {saving ? "Saving…" : "Create Sheet"}
        </button>
        <button onClick={onClose} className="text-sm border px-3 py-1.5 rounded">
          Cancel
        </button>
      </div>
    </div>
  );
}
