"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Ship,
  Factory,
  MapPin,
  Users,
  Truck,
  BarChart3,
  FileSpreadsheet,
  Receipt,
  TrendingUp,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";

// Only Booking & Instructions is real right now. Everything else routes to
// the shared "Work in Progress" page - flip an item's `href` to its real
// route as each module gets built (P1-P4 in the README).
const MODULES: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Booking & Instructions", href: "/bookings", icon: ClipboardList },
  { label: "Forwarders", href: "/forwarders", icon: Ship },
  { label: "Suppliers", href: "/soon/suppliers", icon: Factory },
  { label: "Shipment Tracking", href: "/tracking", icon: MapPin },
  { label: "Buyers / Customers", href: "/parties", icon: Users },
  { label: "Truckers", href: "/truckers", icon: Truck },
  { label: "Freight Comparison", href: "/soon/freight-comparison", icon: BarChart3 },
  { label: "Offer Sheet", href: "/soon/offer-sheet", icon: FileSpreadsheet },
  { label: "Invoices & Statement", href: "/soon/invoices-statement", icon: Receipt },
  { label: "Profit & Loss", href: "/soon/profit-loss", icon: TrendingUp },
  { label: "Dashboard & Reports", href: "/soon/dashboard-reports", icon: LayoutDashboard },
  { label: "Settings & Control", href: "/soon/settings-control", icon: Settings },
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
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              href={m.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm ${
                active ? "bg-accent text-white font-medium" : "text-white/70 hover:bg-navyhover hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" size={16} />
              <span className="truncate">{m.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* No real login yet (see lib/constants.ts DEFAULT_COMPANY_ID) - this
          is a placeholder for the tenant, not a fake logged-in user. */}
      <div className="p-4 border-t border-white/10 flex items-center gap-2 text-white/60 text-xs">
        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/80 font-medium shrink-0">
          A
        </div>
        <div className="min-w-0">
          <div className="text-white/80 truncate">Default Company</div>
          <div className="truncate">Single-tenant mode - no login yet</div>
        </div>
      </div>
    </aside>
  );
}
