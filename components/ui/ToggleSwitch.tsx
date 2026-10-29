"use client";

export default function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-text-2 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative inline-flex shrink-0 rounded-full transition-colors"
        style={{ width: 34, height: 20, background: checked ? "var(--accent)" : "var(--line2)" }}
      >
        <span
          className="absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform"
          style={{ width: 16, height: 16, transform: checked ? "translateX(14px)" : "translateX(0)" }}
        />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}
