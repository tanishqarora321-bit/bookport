"use client";

import { useTheme } from "@/lib/theme-context";

const OPTIONS: { value: "light" | "dark" | "system"; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

// Matches design-v2/SPEC.md's shell markup exactly: a `.seg` radiogroup
// with one `role="radio"` button per theme.
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="seg" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={theme === o.value}
          className={theme === o.value ? "on" : ""}
          onClick={() => setTheme(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
