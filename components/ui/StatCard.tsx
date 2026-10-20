import type { LucideIcon } from "lucide-react";

const TONES = {
  default: { bg: "bg-accent-soft", icon: "text-accent" },
  danger: { bg: "bg-critical-soft", icon: "text-critical" },
  warning: { bg: "bg-warning-soft", icon: "text-warning" },
  success: { bg: "bg-success-soft", icon: "text-success" },
} as const;

export default function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  tone?: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <div className="bg-surface border border-line rounded-xl p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${t.bg}`}>
        <Icon className={`w-4.5 h-4.5 ${t.icon}`} size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted uppercase tracking-wide truncate">{label}</div>
        <div className={`text-2xl font-semibold mt-0.5 ${tone === "danger" ? "text-critical" : "text-ink"}`}>
          {value}
        </div>
        {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
