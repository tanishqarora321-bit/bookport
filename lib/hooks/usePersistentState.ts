"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

// useState that survives leaving the page (owner, 2026-11): filters,
// search, tabs and rows-per-page are kept for this browser tab, so going to
// Forwarders to check something and coming back to Booking & Instructions
// finds everything exactly as it was. Stored in sessionStorage (this tab
// only, gone when the tab closes); read before the first paint, so there's
// no flash of the defaults. Storage that's blocked just means no memory.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const PREFIX = "bp:view:";

export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const restored = useRef(false);

  useIsoLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* no storage - start fresh */
    }
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);

  const set = useCallback<Dispatch<SetStateAction<T>>>((v) => setValue(v), []);
  return [value, set];
}
