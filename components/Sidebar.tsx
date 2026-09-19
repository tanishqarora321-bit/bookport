"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Building2,
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
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from "lucide-react";
import Logo from "@/components/ui/Logo";

// Only Booking & Instructions is real right now. Everything else routes to
// the shared "Work in Progress" page - flip an item's `href` to its real
// route as each module gets built (P1-P4 in the README).
const MODULES: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Booking & Instructions", href: "/bookings", icon: ClipboardList },
  { label: "Forwarders", href: "/forwarders", icon: Building2 },
  { label: "Suppliers", href: "/suppliers", icon: Factory },
  { label: "Shipment Tracking", href: "/tracking", icon: MapPin },
  { label: "Buyers / Customers", href: "/parties", icon: Users },
  { label: "Truckers", href: "/truckers", icon: Truck },
  { label: "Freight Comparison", href: "/freight-comparison", icon: BarChart3 },
  { label: "Offer Sheet", href: "/offer-sheets", icon: FileSpreadsheet },
  { label: "Invoices & Statement", href: "/soon/invoices-statement", icon: Receipt },
  { label: "Profit & Loss", href: "/soon/profit-loss", icon: TrendingUp },
  { label: "Dashboard & Reports", href: "/soon/dashboard-reports", icon: LayoutDashboard },
  { label: "Settings & Control", href: "/soon/settings-control", icon: Settings },
];

const STORAGE_KEY = "bookport:sidebar-collapsed";

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Read the saved preference after mount only - reading localStorage
  // during initial render would mismatch the server-rendered (always
  // expanded) HTML and trigger a hydration warning.
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      // localStorage can throw in a private window or with site data
      // blocked - falling back to the default (expanded) is fine.
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <aside
      className={`${collapsed ? "w-16" : "w-64"} bg-navy text-white h-full flex flex-col shrink-0 overflow-y-auto transition-[width] duration-150`}
    >
      <div className={`flex items-center gap-3 border-b border-white/10 ${collapsed ? "p-3 justify-center" : "p-5"}`}>
        <Logo size={collapsed ? 32 : 36} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold leading-tight">Ship-Sphere</div>
            <div className="text-xs text-white/50 leading-tight">One Booking. All Connected.</div>
          </div>
        )}
      </div>

      <nav className="flex-1 py-2">
        {MODULES.map((m) => {
          const active = pathname === m.href || (m.href === "/bookings" && pathname?.startsWith("/bookings"));
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              href={m.href}
              title={collapsed ? m.label : undefined}
              className={`flex items-center gap-3 py-2.5 text-sm ${collapsed ? "justify-center px-2" : "px-5"} ${
                active ? "bg-accent text-white font-medium" : "text-white/70 hover:bg-navyhover hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" size={16} />
              {!collapsed && <span className="truncate">{m.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={toggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`flex items-center gap-2 py-3 text-xs text-white/50 hover:text-white hover:bg-navyhover border-t border-white/10 ${
          collapsed ? "justify-center px-2" : "px-5"
        }`}
      >
        {collapsed ? <ChevronsRight className="w-4 h-4" size={16} /> : <ChevronsLeft className="w-4 h-4" size={16} />}
        {!collapsed && <span>Collapse</span>}
      </button>

      {/* No real login yet (see lib/constants.ts DEFAULT_COMPANY_ID) - this
          is a placeholder for the tenant, not a fake logged-in user. */}
      <div className={`border-t border-white/10 flex items-center gap-2 text-white/60 text-xs ${collapsed ? "p-3 justify-center" : "p-4"}`}>
        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/80 font-medium shrink-0">
          A
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-white/80 truncate">Default Company</div>
            <div className="truncate">Single-tenant mode - no login yet</div>
          </div>
        )}
      </div>
    </aside>
  );
}
