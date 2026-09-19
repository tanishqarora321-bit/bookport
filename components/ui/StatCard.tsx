import type { LucideIcon } from "lucide-react";

const TONES = {
  default: { bg: "bg-blue-50", icon: "text-accent" },
  danger: { bg: "bg-red-50", icon: "text-cutoff" },
  warning: { bg: "bg-amber-50", icon: "text-amend" },
  success: { bg: "bg-emerald-50", icon: "text-emerald-600" },
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
    <div className="bg-white rounded-xl shadow-sm p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${t.bg}`}>
        <Icon className={`w-4.5 h-4.5 ${t.icon}`} size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-400 uppercase tracking-wide truncate">{label}</div>
        <div className={`text-2xl font-semibold mt-0.5 ${tone === "danger" ? "text-cutoff" : "text-slate-800"}`}>
          {value}
        </div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
