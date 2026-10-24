"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type StatusOption = { value: string; label: string; badgeClass: string };

// A native <select> styled as a badge still renders its OPEN dropdown with
// plain OS/browser chrome (a flat list, system font, no colors) - there's
// no way to style option content, only the closed control. This renders
// the open menu itself (colored status pills, checkmark on the current
// one) via a portal to <body>, so it escapes the table's own
// `overflow:auto` instead of being clipped by it, matching the design
// reference's V2Admin.dc.html status menu exactly.
export default function StatusMenuButton({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: StatusOption[];
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => setMounted(true), []);

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const estimatedHeight = options.length * 34 + 12;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < estimatedHeight && rect.top > estimatedHeight ? rect.top - estimatedHeight - 6 : rect.bottom + 6;
    const left = Math.max(8, Math.min(window.innerWidth - 208, rect.left));
    setPos({ top, left });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`badge ${current.badgeClass}`}
        style={{ border: 0, cursor: "pointer", font: "inherit" }}
      >
        {current.label}
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open &&
        pos &&
        mounted &&
        createPortal(
          <div ref={menuRef} role="listbox" aria-label={ariaLabel} className="menu" style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 100 }}>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`opt ${o.value === value ? "sel" : ""}`}
                style={{ width: "100%", border: 0, background: "transparent", cursor: "pointer", justifyContent: "space-between" }}
                onClick={() => {
                  setOpen(false);
                  if (o.value !== value) onChange(o.value);
                }}
              >
                <span className={`badge ${o.badgeClass}`}>{o.label}</span>
                {o.value === value && (
                  <span aria-hidden="true" style={{ color: "var(--accent)" }}>
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
