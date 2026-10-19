"use client";

import { createContext, useContext, useEffect, useState } from "react";

// A single app-wide "which year am I working in" toggle (Sidebar's
// <YearSelector />) - a per-viewer convenience (localStorage), not
// canonical data, so it's fine that it doesn't sync between devices/
// tabs. Nothing currently treats this as the source of truth for a
// record's own year - a booking's year comes from its own Month of
// Loading (ERD), an invoice's from its own invoice_date, a payment's
// from its own applies_to_year (explicitly asked for on entry, since
// a payment's date and which year's dues it settles can differ). This
// selector exists to PRE-FILL that choice and to default which year's
// data a page shows, not to retroactively relabel anything.
const STORAGE_KEY = "bookport:selected-year";

type YearContextValue = {
  year: number;
  setYear: (y: number) => void;
};

const YearContext = createContext<YearContextValue | null>(null);

export function YearProvider({ children }: { children: React.ReactNode }) {
  const [year, setYearState] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const n = parseInt(stored, 10);
        if (!isNaN(n)) setYearState(n);
      }
    } catch {
      /* private window / blocked storage - just keep the default (current year) */
    }
  }, []);

  function setYear(y: number) {
    setYearState(y);
    try {
      localStorage.setItem(STORAGE_KEY, String(y));
    } catch {
      /* not fatal - selection just won't persist across reloads */
    }
  }

  return <YearContext.Provider value={{ year, setYear }}>{children}</YearContext.Provider>;
}

export function useYear(): YearContextValue {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error("useYear() must be used within a YearProvider");
  return ctx;
}
