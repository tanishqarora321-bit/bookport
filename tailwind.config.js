/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Legacy tokens, now theme-reactive via CSS vars (see globals.css)
        // instead of fixed hex - existing class usage (text-ink, bg-accent,
        // bg-navy, etc.) keeps working and gets dark-mode support for free.
        ink: "var(--color-text)",
        cutoff: "#dc2626",
        amend: "#d97706",
        navy: "var(--color-nav)",
        navyhover: "var(--color-nav-hover)",
        accent: "var(--color-accent)",

        // Ship-Sphere Design System v2 tokens
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        elevated: "var(--color-elevated)",
        text: "var(--color-text)",
        "text-2": "var(--color-text-2)",
        muted: "var(--color-muted)",
        line: "var(--color-line)",
        "line-2": "var(--color-line-2)",
        "accent-hover": "var(--color-accent-hover)",
        "accent-soft": "var(--color-accent-soft)",
        success: "var(--color-success)",
        "success-soft": "var(--color-success-soft)",
        warning: "var(--color-warning)",
        "warning-soft": "var(--color-warning-soft)",
        critical: "var(--color-critical)",
        "critical-soft": "var(--color-critical-soft)",
        info: "var(--color-info)",
        "info-soft": "var(--color-info-soft)",
        "ai-border": "var(--color-ai-border)",
        "nav-active": "var(--color-nav-active)",
        "nav-muted": "var(--color-nav-muted)",
      },
    },
  },
  plugins: [],
};
