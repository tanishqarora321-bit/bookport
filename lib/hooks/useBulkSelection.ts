"use client";

import { useCallback, useMemo, useState } from "react";

// Shared selection state for every module's "select rows -> bulk delete"
// toolbar (testing-data cleanup before launch) - one hook per table, keyed
// by whatever id the caller considers the unit of deletion (a booking_id
// for the per-container-flattened Bookings grid, a party id for Parties/
// Forwarders/Truckers/Suppliers, an invoice id for a ledger, etc.).
export function useBulkSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // "Select all" only ever covers what's currently visible (this page/
  // filter), never silently reaching into rows the person can't see.
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (visibleIds.length > 0 && visibleIds.every((id) => prev.has(id))) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  }, [visibleIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  // Drop any selected id that's scrolled out of the current filtered/
  // paginated result (e.g. a filter changed) - keeps the "N selected"
  // count honest rather than counting rows no longer on screen at all.
  const pruneToVisible = useCallback((currentlyKnownIds: Set<string>) => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => currentlyKnownIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const selectedCount = selected.size;
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  return { selected, selectedIds, selectedCount, toggle, toggleAll, allVisibleSelected, clear, pruneToVisible };
}
