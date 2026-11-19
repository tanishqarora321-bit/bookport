// "Coming soon" page for a module that's planned but not open yet (owner,
// 2026-11-19 - chosen over "Work in progress", which reads as broken).
export default function ComingSoon({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <div className="h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <span className="badge b-acc mb-4" style={{ fontSize: 12 }}>Coming soon</span>
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="text-text-2 mt-2 max-w-md">{blurb ?? "We're building this module. It will be available here soon."}</p>
    </div>
  );
}
