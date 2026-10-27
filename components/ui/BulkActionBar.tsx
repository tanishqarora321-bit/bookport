"use client";

// Shared "N selected" strip for every module's admin-only bulk-delete
// tool (testing-data cleanup before launch). Only renders once something
// is actually selected - stays out of the way otherwise.
export default function BulkActionBar({
  count,
  itemLabel,
  onDeleteClick,
  onClear,
  deleting = false,
}: {
  count: number;
  itemLabel: string;
  onDeleteClick: () => void;
  onClear: () => void;
  deleting?: boolean;
}) {
  if (count === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        background: "var(--accentS)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <span className="lbl" style={{ fontWeight: 600, color: "var(--accent)" }}>
        {count} {itemLabel}
        {count === 1 ? "" : "s"} selected
      </span>
      <button type="button" onClick={onDeleteClick} disabled={deleting} className="btn btn-dp btn-s">
        {deleting ? "Deleting…" : "Delete Selected"}
      </button>
      <button type="button" onClick={onClear} disabled={deleting} className="btn btn-g btn-s">
        Clear
      </button>
    </div>
  );
}
