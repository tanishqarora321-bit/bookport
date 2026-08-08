"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Only Booking & Instructions is real right now. Everything else routes to
// the shared "Work in Progress" page - flip an item's `href` to its real
// route as each module gets built (P1-P4 in the README).
const MODULES = [
  { no: "01", label: "Booking & Instructions", href: "/bookings" },
  { no: "02", label: "Forwarders", href: "/soon/forwarders" },
  { no: "03", label: "Suppliers", href: "/soon/suppliers" },
  { no: "04", label: "Shipment Tracking", href: "/soon/shipment-tracking" },
  { no: "05", label: "Buyers / Customers", href: "/soon/buyers-customers" },
  { no: "06", label: "Truckers", href: "/soon/truckers" },
  { no: "07", label: "Freight Comparison", href: "/soon/freight-comparison" },
  { no: "08", label: "Offer Sheet", href: "/soon/offer-sheet" },
  { no: "09", label: "Invoices & Statement", href: "/soon/invoices-statement" },
  { no: "10", label: "Profit & Loss", href: "/soon/profit-loss" },
  { no: "11", label: "Dashboard & Reports", href: "/soon/dashboard-reports" },
  { no: "12", label: "Settings & Control", href: "/soon/settings-control" }
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-navy text-white h-full flex flex-col shrink-0 overflow-y-auto">
      <div className="p-5 flex items-center gap-3 border-b border-white/10">
        <div className="w-9 h-9 rounded bg-accent flex items-center justify-center font-bold">B</div>
        <div>
          <div className="font-semibold leading-tight">Bookport</div>
          <div className="text-xs text-white/50 leading-tight">One Booking. All Connected.</div>
        </div>
      </div>

      <nav className="flex-1 py-2">
        {MODULES.map((m) => {
          const active = pathname === m.href || (m.href === "/bookings" && pathname?.startsWith("/bookings"));
          return (
            <Link
              key={m.no}
              href={m.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm ${
                active ? "bg-accent text-white font-medium" : "text-white/70 hover:bg-navyhover hover:text-white"
              }`}
            >
              <span className="text-xs text-white/40 w-5">{m.no}</span>
              {m.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
