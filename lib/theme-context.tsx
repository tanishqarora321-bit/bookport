"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Light / Dark / System, per design-v2/HANDOFF.md: the theme is a class
// on <html> (.th-light / .th-dark / .th-system, see app/globals.css's
// TOKENS block), not a data attribute - "System" stays the literal
// stored value and the actual light/dark values come from the OS via
// the @media query in globals.css, not from JS re-evaluating anything.
// The inline script in app/layout.tsx sets this same class before first
// paint so there's no flash of the wrong theme.
const STORAGE_KEY = "bookport:theme";
const CLASSES = ["th-light", "th-dark", "th-system"] as const;

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyClass(t: Theme) {
  const root = document.documentElement;
  root.classList.remove(...CLASSES);
  root.classList.add(`th-${t}`);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    let resolved: Theme = "system";
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "light" || stored === "dark" || stored === "system") {
        resolved = stored;
      }
    } catch {
      /* private window / blocked storage - default (system) is fine */
    }
    setThemeState(resolved);
    // Re-apply the class here too, rather than trusting the inline
    // anti-flash script (app/layout.tsx) to have already done it. That
    // script runs before paint in the ordinary case, but it has no
    // fallback if it simply never executes - confirmed live: a freshly
    // opened tab rendered with no th-light/th-dark/th-system class on
    // <html> at all, so every CSS variable the design system depends on
    // (--nav, --accent, --line, ...) resolved to nothing and the whole
    // app looked unstyled, recovering only once someone manually used
    // the theme switcher (which calls this same applyClass()). Calling
    // it again here is a no-op when the inline script did run, and the
    // only fix when it didn't.
    applyClass(resolved);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    applyClass(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* not fatal - choice just won't persist across reloads */
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used within a ThemeProvider");
  return ctx;
}
