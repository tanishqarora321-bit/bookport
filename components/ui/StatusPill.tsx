// Maps known status strings to a colour. `release_status` and similar
// fields are free text (a carrier or ops person can type anything), so
// this is intentionally a best-effort lookup with a neutral fallback
// rather than a fixed enum - it must never fail to render unknown text.
const KNOWN: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  confirmed: "bg-blue-100 text-blue-700",
  in_transit: "bg-amber-100 text-amber-700",
  "in transit": "bg-amber-100 text-amber-700",
  delivered: "bg-emerald-100 text-emerald-700",
  released: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  awaiting: "bg-amber-100 text-amber-700",
  pending: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
  unpaid: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
};

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StatusPill({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const classes = KNOWN[value.toLowerCase()] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${classes}`}>
      {label(value)}
    </span>
  );
}
