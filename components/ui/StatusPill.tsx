// Ship-Sphere Design System v2 status badges: "Dot + text, never color
// alone. Same meaning = same color everywhere." `release_status` and
// similar fields are free text (a carrier or ops person can type
// anything), so this is intentionally a best-effort lookup with a
// neutral fallback rather than a fixed enum - it must never fail to
// render unknown text.
const TONE: Record<string, "muted" | "info" | "warning" | "success" | "critical"> = {
  draft: "muted",
  confirmed: "info",
  in_transit: "warning",
  "in transit": "warning",
  delivered: "success",
  released: "success",
  "on water": "info",
  on_water: "info",
  "— set —": "muted",
  cancelled: "critical",
  removed: "muted",
  awaiting: "warning",
  pending: "warning",
  sent: "success",
  "not sent": "muted",
  not_sent: "muted",
  unpaid: "critical",
  paid: "success",
  active: "success",
  trial: "info",
  suspended: "warning",
  missing: "warning",
  y: "success",
  n: "critical",
};

const DOT_CLASS: Record<string, string> = {
  muted: "bg-muted",
  info: "bg-info",
  warning: "bg-warning",
  success: "bg-success",
  critical: "bg-critical",
};

const TEXT_CLASS: Record<string, string> = {
  muted: "text-muted",
  info: "text-info",
  warning: "text-warning",
  success: "text-success",
  critical: "text-critical",
};

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StatusPill({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted">—</span>;
  const tone = TONE[value.toLowerCase()] ?? "muted";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${TEXT_CLASS[tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_CLASS[tone]}`} />
      {label(value)}
    </span>
  );
}
