// A simplified version of the Design System v2 mockup's six-stage status
// timeline (Booked / Buyer Assigned / Instructions / Gated In / Sailed /
// Arrived). This app doesn't track a separate "gated in" or "sailed"
// timestamp anywhere - the only real milestones it can honestly report
// are these five, each backed by a real column rather than an invented one:
// booking creation, a buyer being assigned (tracking row with a party),
// instructions having been sent, and the tracking entry's own release
// status (On Water / Released).
export type TimelineStage = {
  label: string;
  done: boolean;
  date?: string | null;
  current?: boolean;
};

function fmt(date?: string | null) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// `state` is the booking's own stage (lib/bookings-data.ts). A cancelled
// booking must not look like it's still progressing: no "current" stage is
// highlighted - only the milestones it actually reached, plus a Cancelled
// badge. A closed one is finished, so likewise nothing is "current".
export default function BookingStatusTimeline({ stages, state = "open" }: { stages: TimelineStage[]; state?: "open" | "closed" | "cancelled" }) {
  const lastDoneIndex = stages.reduce((acc, s, i) => (s.done ? i : acc), -1);
  const currentIndex = state === "open" && lastDoneIndex + 1 < stages.length ? lastDoneIndex + 1 : -1;

  const badge =
    state === "cancelled"
      ? { cls: "b-crit", text: "Cancelled" }
      : state === "closed"
      ? { cls: "b-ok", text: "Closed" }
      : currentIndex >= 0
      ? { cls: "b-info", text: `Next: ${stages[currentIndex].label}` }
      : { cls: "b-ok", text: stages[stages.length - 1]?.label ?? "Done" };

  return (
    <section className="card" aria-label="Shipment progress" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 className="h2">Shipment progress</h2>
          <p className="lbl" style={{ margin: "4px 0 0" }}>
            {state === "cancelled" ? "This booking was cancelled - showing the milestones it reached." : "Operational milestones for this booking"}
          </p>
        </div>
        <span className={`badge ${badge.cls}`}>{badge.text}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length}, minmax(90px, 1fr))`, gap: 8, overflowX: "auto" }}>
        {stages.map((s, i) => {
          const done = i <= lastDoneIndex && s.done;
          const current = i === currentIndex;
          return (
            <div key={s.label} style={{ minWidth: 0, opacity: state === "cancelled" && !done ? 0.55 : 1 }}>
              <div
                style={{
                  height: 5,
                  borderRadius: 9,
                  marginBottom: 9,
                  background: done ? "var(--ok)" : current ? "var(--accent)" : "var(--line)",
                }}
              />
              <div style={{ fontSize: 13, fontWeight: 600, color: done ? "var(--tx)" : current ? "var(--accent)" : "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.label}
              </div>
              <div className="meta" style={{ marginTop: 3 }}>
                {fmt(s.date) ?? (done ? "Done" : current ? "Current stage" : state === "cancelled" ? "Not reached" : "Not yet")}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
