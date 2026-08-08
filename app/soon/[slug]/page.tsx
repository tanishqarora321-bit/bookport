const TITLES: Record<string, string> = {
  forwarders: "Forwarders",
  suppliers: "Suppliers",
  "shipment-tracking": "Shipment Tracking",
  "buyers-customers": "Buyers / Customers",
  truckers: "Truckers",
  "freight-comparison": "Freight Comparison",
  "offer-sheet": "Offer Sheet",
  "invoices-statement": "Invoices & Statement",
  "profit-loss": "Profit & Loss",
  "dashboard-reports": "Dashboard & Reports",
  "settings-control": "Settings & Control"
};

export default function ComingSoon({ params }: { params: { slug: string } }) {
  const title = TITLES[params.slug] ?? "This module";

  return (
    <div className="h-[70vh] flex flex-col items-center justify-center text-center">
      <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-2xl mb-4">🚧</div>
      <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      <p className="text-slate-500 mt-1">Work in progress — not built yet.</p>
      <p className="text-slate-400 text-sm mt-4 max-w-sm">
        Booking & Instructions is the only live module right now, by design —
        it's the foundation everything else reads from.
      </p>
    </div>
  );
}
