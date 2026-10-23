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
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function BookingStatusTimeline({ stages }: { stages: TimelineStage[] }) {
  const lastDoneIndex = stages.reduce((acc, s, i) => (s.done ? i : acc), -1);

  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <div className="flex">
        {stages.map((s, i) => (
          <div key={s.label} className="flex-1 min-w-0">
            <div
              className={`h-1.5 rounded-full ${i === 0 ? "" : "ml-1"} ${
                i <= lastDoneIndex ? "bg-success" : i === lastDoneIndex + 1 ? "bg-accent" : "bg-line"
              }`}
            />
            <div className="mt-2">
              <div className={`text-xs font-medium truncate ${i <= lastDoneIndex ? "text-ink" : i === lastDoneIndex + 1 ? "text-accent" : "text-muted"}`}>
                {s.label}
              </div>
              <div className="text-[11px] text-muted truncate">{fmt(s.date) ?? " "}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
