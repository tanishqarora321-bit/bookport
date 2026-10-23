import type { LucideIcon } from "lucide-react";

// Matches design-v2/SPEC.md's `.card.kpi` exactly: a plain label/value/
// meta stack, no icon chip - except the "danger" tone, which gets a
// small inline icon next to the label plus a colored border, same as
// the "Cut-off within 48h" card in design-v2/screens/V2Bookings.dc.html.
// `icon` is only ever drawn for that one case; every other tone ignores
// it so existing call sites (which all pass one) don't need to change.
const TONE_COLOR: Record<string, string> = {
  danger: "var(--crit)",
  warning: "var(--warn)",
  success: "var(--ok)",
};

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
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const isDanger = tone === "danger";
  const color = TONE_COLOR[tone];

  return (
    <div className="card kpi" style={isDanger ? { borderColor: "var(--crit)" } : undefined}>
      <span className="lbl" style={isDanger ? { display: "flex", alignItems: "center", gap: 6, color, fontWeight: 600 } : undefined}>
        {isDanger && <Icon size={14} />}
        {label}
      </span>
      <span className="v" style={color ? { color } : undefined}>
        {value}
      </span>
      {sub && <span className="meta">{sub}</span>}
    </div>
  );
}
