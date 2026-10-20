/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", ".th-dark"],
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mapped onto the approved design-v2/SPEC.md TOKENS (see
        // app/globals.css) - these Tailwind utility names are our own
        // abstraction so existing className usage (bg-surface, text-ink,
        // etc.) keeps working; the CSS variable VALUES are what actually
        // have to match the approved spec exactly.
        bg: "var(--bg)",
        surface: "var(--surf)",
        "surface-2": "var(--surf2)",
        elevated: "var(--elev)",
        ink: "var(--tx)",
        "text-2": "var(--tx2)",
        muted: "var(--mut)",
        line: "var(--line)",
        "line-2": "var(--line2)",
        accent: "var(--accent)",
        "accent-hover": "var(--accentH)",
        "on-accent": "var(--onAccent)",
        "accent-soft": "var(--accentS)",
        success: "var(--ok)",
        "success-soft": "var(--okS)",
        warning: "var(--warn)",
        "warning-soft": "var(--warnS)",
        "ai-border": "var(--warnB)",
        critical: "var(--crit)",
        "critical-soft": "var(--critS)",
        info: "var(--info)",
        "info-soft": "var(--infoS)",
        neutral2: "var(--neu)",
        "neutral-soft": "var(--neuS)",
        focus: "var(--focus)",
        navy: "var(--nav)",
        navyhover: "var(--navH)",
        "nav-text": "var(--navTx)",
        "nav-muted": "var(--navMut)",
        "nav-active": "var(--navAct)",

        // Legacy fixed destructive/warn accents kept for any not-yet-
        // reskinned screen still referencing them.
        cutoff: "#dc2626",
        amend: "#d97706",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
