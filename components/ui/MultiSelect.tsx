"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A filter dropdown where several values can be ticked (owner, 2026-11).
// Nothing ticked = "All". Same height/look as the single selects
// (.select.select-s); opens a checklist with a search box when long.
export default function MultiSelect({
  label,
  allLabel,
  options,
  value,
  onChange,
  width = 200,
  format,
}: {
  label: string; // accessible name, e.g. "Buyer"
  allLabel: string; // e.g. "All Buyers"
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  width?: number;
  format?: (v: string) => string; // display text for an option
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The list floats above the page (fixed position, in a portal) so a
  // card's overflow can never cut it off.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const show = (v: string) => (format ? format(v) : v);

  useEffect(() => {
    if (!open) return;
    function place() {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const w = Math.max(width, 220);
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) });
    }
    place();
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScroll(e: Event) {
      if (listRef.current && listRef.current.contains(e.target as Node)) return;
      place();
    }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, width]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => show(o).toLowerCase().includes(s)) : options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, q]);

  const text = value.length === 0 ? allLabel : value.length === 1 ? show(value[0]) : `${value.length} selected`;
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);

  return (
    <div ref={ref} style={{ position: "relative", width }}>
      <button
        type="button"
        className="select select-s"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${text}`}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: value.length ? "var(--accent)" : undefined,
          borderColor: value.length ? "var(--accent)" : undefined,
          fontWeight: value.length ? 600 : undefined,
        }}
      >
        {text}
      </button>
      {open &&
        pos &&
        createPortal(
        <div
          ref={listRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="bg-surface border border-line rounded-lg shadow-lg"
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 60, minWidth: Math.max(width, 220), maxWidth: 360 }}
        >
          {options.length > 8 && (
            <div className="p-2 border-b border-line">
              <input
                autoFocus
                type="search"
                autoComplete="off"
                aria-label={`Search ${label}`}
                placeholder="Search…"
                className="border border-line rounded-lg px-2 py-1 text-sm w-full bg-surface"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-line text-xs">
            <button type="button" className="text-accent hover:underline" onClick={() => onChange(Array.from(new Set([...value, ...visible])))}>
              Select all
            </button>
            <button type="button" className="text-muted hover:text-ink" onClick={() => onChange([])}>
              Clear
            </button>
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }} className="py-1">
            {visible.map((o) => (
              <label key={o} className="flex items-center gap-2 px-3 py-1.5 text-sm text-ink hover:bg-surface-2 cursor-pointer">
                <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />
                <span className="truncate">{show(o)}</span>
              </label>
            ))}
            {visible.length === 0 && <div className="px-3 py-2 text-xs text-muted">No matches</div>}
          </div>
        </div>,
          document.body
        )}
    </div>
  );
}
