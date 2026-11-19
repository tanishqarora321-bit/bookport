// Shown the instant a sidebar link is clicked (owner, 2026-11: "switching
// modules is slow") while the next page's data loads on the server - the
// sidebar stays, the content area shows this outline instead of the old
// page sitting frozen.
export default function Loading() {
  const bar = (w: string | number, h = 14) => <div className="animate-pulse rounded-md bg-surface-2" style={{ width: w, height: h }} />;
  return (
    <div className="h-full flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          {bar(260, 24)}
          {bar(420)}
        </div>
        <div className="flex gap-2">
          {bar(130, 34)}
          {bar(150, 34)}
        </div>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-3">
            {bar("60%")}
            {bar("40%", 22)}
          </div>
        ))}
      </div>
      <div className="flex-1 min-h-0 bg-surface border border-line rounded-xl overflow-hidden">
        <div className="flex gap-2.5 px-4 py-3 border-b border-line">
          {bar(300, 34)}
          {bar(150, 34)}
          {bar(150, 34)}
          {bar(150, 34)}
        </div>
        <div className="flex flex-col">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex gap-6 px-4 py-4 border-b border-line">
              {bar(120)}
              {bar(130)}
              {bar(90)}
              {bar(160)}
              {bar(110)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
