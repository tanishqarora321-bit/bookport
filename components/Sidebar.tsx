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
  TrendingUp,
  Settings,
  ShieldCheck,
  Copy,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from "lucide-react";
import Logo from "@/components/ui/Logo";
import { createClient } from "@/lib/supabase/client";
import { useYear } from "@/lib/year-context";
import { LogOut } from "lucide-react";

// Grouped to match the Ship-Sphere Design System v2 nav (Operations /
// Partners / Commercial / Finance / Admin). Badge is an optional live count
// fetched separately (see `badgeKey`), not a static value here.
type NavItem = { label: string; href: string; icon: LucideIcon; badgeKey?: "duplicateBookings" };
type NavGroup = { heading: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Operations",
    items: [
      { label: "Booking & Instructions", href: "/bookings", icon: ClipboardList },
      { label: "Multiple Bookings", href: "/bookings/multiple", icon: Copy, badgeKey: "duplicateBookings" },
      { label: "Shipment Tracking", href: "/tracking", icon: MapPin },
    ],
  },
  {
    heading: "Partners",
    items: [
      { label: "Buyers / Customers", href: "/parties", icon: Users },
      { label: "Forwarders", href: "/forwarders", icon: Building2 },
      { label: "Suppliers", href: "/suppliers", icon: Factory },
      { label: "Truckers", href: "/truckers", icon: Truck },
    ],
  },
  {
    heading: "Commercial",
    items: [
      { label: "Freight Comparison", href: "/freight-comparison", icon: BarChart3 },
      { label: "Offer Sheet", href: "/offer-sheets", icon: FileSpreadsheet },
    ],
  },
  {
    heading: "Finance",
    items: [{ label: "Profit & Loss", href: "/profit-loss", icon: TrendingUp }],
  },
  {
    heading: "Admin",
    items: [{ label: "Settings & Control", href: "/team", icon: Settings }],
  },
];

const STORAGE_KEY = "bookport:sidebar-collapsed";

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [duplicateBookings, setDuplicateBookings] = useState(0);

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

  // Stage-1 login groundwork: this only reflects whether a session
  // cookie exists, it doesn't gate access to anything yet (see
  // middleware.ts). Nothing breaks for the DEFAULT_COMPANY_ID flow if
  // no one has signed in - the footer just falls back to the
  // placeholder below.
  useEffect(() => {
    function loadProfile() {
      fetch("/api/me")
        .then((r) => r.json())
        .then(({ user }) => {
          setUserEmail(user?.email ?? null);
          setCompanyName(user?.company_name ?? null);
          setIsPlatformOwner(!!user?.is_platform_owner);
        })
        .catch(() => {});
    }
    loadProfile();
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadProfile());
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetch("/api/bookings/duplicate-count")
      .then((r) => r.json())
      .then(({ count }) => setDuplicateBookings(count ?? 0))
      .catch(() => {});
  }, [pathname]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  // /login and /auth/callback are pre-auth screens that render their own
  // centered layout - no app chrome around them. Checked after all hooks
  // above so their call order never changes across a client-side
  // navigation to/from either route.
  if (pathname === "/login" || pathname === "/auth/callback") return null;

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

      <YearSelector collapsed={collapsed} />

      <nav className="flex-1 py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="mb-1">
            {!collapsed && (
              <div className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-wide text-white/40 font-medium">
                {group.heading}
              </div>
            )}
            {group.items.map((m) => {
              const active =
                pathname === m.href ||
                (m.href === "/bookings" && pathname?.startsWith("/bookings") && !pathname?.startsWith("/bookings/multiple"));
              const Icon = m.icon;
              const badge = m.badgeKey === "duplicateBookings" ? duplicateBookings : 0;
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
                  {!collapsed && (
                    <span className="truncate flex-1 flex items-center justify-between gap-2">
                      {m.label}
                      {badge > 0 && (
                        <span className="bg-amend text-white text-[11px] font-semibold rounded-full px-1.5 py-0.5 leading-none">
                          {badge}
                        </span>
                      )}
                    </span>
                  )}
                </Link>
              );
            })}
            {group.heading === "Admin" && isPlatformOwner && (
              <Link
                href="/admin"
                title={collapsed ? "Platform Admin" : undefined}
                className={`flex items-center gap-3 py-2.5 text-sm ${collapsed ? "justify-center px-2" : "px-5"} ${
                  pathname === "/admin" ? "bg-accent text-white font-medium" : "text-white/70 hover:bg-navyhover hover:text-white"
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" size={16} />
                {!collapsed && <span className="truncate">Platform Admin</span>}
              </Link>
            )}
          </div>
        ))}
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

      <div className={`border-t border-white/10 flex items-center gap-2 text-white/60 text-xs ${collapsed ? "p-3 justify-center" : "p-4"}`}>
        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/80 font-medium shrink-0">
          {userEmail ? userEmail[0].toUpperCase() : "A"}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            {userEmail ? (
              <>
                <div className="text-white/90 font-medium truncate" title={companyName ?? undefined}>
                  {companyName ?? "—"}
                </div>
                <div className="truncate" title={userEmail}>{userEmail}</div>
              </>
            ) : (
              <>
                <div className="text-white/80 truncate">Default Company</div>
                <div className="truncate">Single-tenant mode - not signed in</div>
              </>
            )}
          </div>
        )}
        {!collapsed && userEmail && (
          <button onClick={signOut} title="Sign out" className="text-white/40 hover:text-white shrink-0">
            <LogOut className="w-4 h-4" size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}

// App-wide "which year am I working in" toggle - defaults which year's
// data pages show and pre-fills the year on new entries (e.g. Payment
// History's "Applies to Year"), never retroactively relabels anything.
// A record's own year always comes from its own date (a booking's Month
// of Loading, an invoice's invoice_date, a payment's own applies_to_year).
function YearSelector({ collapsed }: { collapsed: boolean }) {
  const { year, setYear } = useYear();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  if (collapsed) {
    return (
      <div className="px-2 py-2 border-b border-white/10 text-center text-[11px] text-white/50" title={`Year: ${year}`}>
        {year}
      </div>
    );
  }

  return (
    <div className="px-5 py-2.5 border-b border-white/10">
      <label className="text-[10px] uppercase tracking-wide text-white/40 block mb-1">Year</label>
      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="w-full bg-navyhover text-white text-sm rounded px-2 py-1 border border-white/10"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
