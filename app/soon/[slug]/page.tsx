import ComingSoon from "@/components/ComingSoon";

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

export default function ComingSoonPage({ params }: { params: { slug: string } }) {
  return <ComingSoon title={TITLES[params.slug] ?? "This module"} />;
}
