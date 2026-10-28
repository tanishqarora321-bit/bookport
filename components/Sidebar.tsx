"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/ui/Logo";
import { createClient } from "@/lib/supabase/client";
import { useYear } from "@/lib/year-context";
import { NAV_GROUPS, NAV_ICON_PATHS, navKeyForPathname } from "@/lib/nav";

const STORAGE_KEY = "bookport:sidebar-collapsed";

// Matches design-v2/screens/V2Nav.dc.html exactly: logo, Working Year
// select, grouped nav with inline-SVG icons (the design's own path
// data, not an icon library) and a visually-hidden label on the
// "booking numbers to review" badge, collapse button, user footer.
export default function Sidebar() {
  const pathname = usePathname();
  const activeKey = navKeyForPathname(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [duplicateBookings, setDuplicateBookings] = useState(0);
  // Which nav groups are expanded. Always kept in sync with the active
  // route below (the current section is never collapsed out from under
  // you), otherwise left to whatever the user has clicked open.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  // Read the saved preference after mount only - reading localStorage
  // during initial render would mismatch the server-rendered (always
  // expanded) HTML and trigger a hydration warning. With no saved
  // preference yet, default to the icon rail on tablet-width viewports
  // (<1280px) and expanded on desktop, matching the redesign spec.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") { setCollapsed(true); return; }
      if (stored === "0") return;
      if (window.matchMedia("(max-width: 1279px)").matches) setCollapsed(true);
    } catch {
      // localStorage/matchMedia can throw in a private window or with
      // site data blocked - falling back to the default (expanded) is fine.
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

  // The group containing whatever page you're on is always expanded -
  // added to whatever's already open, never replacing it, so a group you
  // opened yourself doesn't snap shut on an unrelated navigation.
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((g) => g.items.some((it) => it.key === activeKey));
    if (!activeGroup) return;
    setOpenGroups((prev) => (prev.has(activeGroup.label) ? prev : new Set(prev).add(activeGroup.label)));
  }, [activeKey]);

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

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // /login and /auth/callback are pre-auth screens that render their own
  // centered layout - no app chrome around them. Checked after all hooks
  // above so their call order never changes across a client-side
  // navigation to/from either route.
  if (pathname === "/login" || pathname === "/auth/callback") return null;

  // "Platform Admin" only shows for the platform owner - every other
  // item is visible to everyone, same as before.
  const visibleGroups = NAV_GROUPS.map((g) =>
    g.label === "Workspace" ? { ...g, items: g.items.filter((it) => it.key !== "admin" || isPlatformOwner) } : g
  );

  return (
    <nav
      aria-label="Main"
      style={{ background: "var(--nav)", color: "var(--navTx)", width: collapsed ? 64 : 244 }}
      className="h-full flex flex-col shrink-0 overflow-hidden transition-[width] duration-150"
    >
      <div
        className={`flex items-center gap-3 ${collapsed ? "justify-center" : "px-[18px]"}`}
        style={{ height: 64, borderBottom: "1px solid var(--navLine)" }}
      >
        <Logo size={collapsed ? 32 : 36} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[16px] font-bold tracking-tight leading-tight">Ship-Sphere</div>
            <div className="text-xs leading-tight" style={{ color: "var(--navMut)" }}>
              One Booking. All Connected.
            </div>
          </div>
        )}
      </div>

      <YearSelector collapsed={collapsed} />

      <div className="flex-1 overflow-y-auto px-2.5 py-2 flex flex-col gap-2.5">
        {visibleGroups.map((group) => {
          const isOpen = collapsed || openGroups.has(group.label);
          return (
          <div key={group.label} className="flex flex-col gap-0.5">
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={isOpen}
                aria-controls={`navgroup-${group.label}`}
                className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide px-2.5 pt-1.5 pb-1 border-0 bg-transparent w-full cursor-pointer"
                style={{ color: "var(--navMut)", letterSpacing: "0.06em" }}
              >
                {group.label}
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 150ms", flexShrink: 0 }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}
            {isOpen && (
            <div id={`navgroup-${group.label}`} className="flex flex-col gap-0.5">
            {group.items.map((it) => {
              const active = it.key === activeKey;
              const badge = it.badgeKey === "duplicateBookings" ? duplicateBookings : 0;
              return (
                <Link
                  key={it.key}
                  href={it.href}
                  title={collapsed ? it.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`nav-a flex items-center gap-2.5 rounded-lg text-sm ${
                    collapsed ? "justify-center px-2" : "px-2.5"
                  }`}
                  style={{
                    minHeight: 33,
                    background: active ? "var(--navAct)" : "transparent",
                    color: active ? "#FFFFFF" : "rgba(255,255,255,0.86)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={active ? 1.9 : 1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                  >
                    <path d={NAV_ICON_PATHS[it.key]} />
                  </svg>
                  {!collapsed && (
                    <span className="flex-1 flex items-center justify-between gap-2 min-w-0">
                      <span className="truncate">{it.label}</span>
                      {badge > 0 && (
                        <span
                          className="inline-flex items-center justify-center shrink-0 text-xs font-bold rounded-full"
                          style={{ minWidth: 22, height: 20, padding: "0 7px", background: "#F59E0B", color: "#0C1A3A" }}
                        >
                          {badge}
                          <span className="sr">{" booking numbers to review"}</span>
                        </span>
                      )}
                    </span>
                  )}
                </Link>
              );
            })}
            </div>
            )}
          </div>
          );
        })}
      </div>

      <button
        onClick={toggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`flex items-center gap-2.5 h-10 mx-2.5 px-2.5 border-0 rounded-lg bg-transparent text-[13px] ${
          collapsed ? "justify-center" : ""
        }`}
        style={{ color: "var(--navMut)" }}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={collapsed ? "M13 7l5 5-5 5M6 7l5 5-5 5" : "M11 17l-5-5 5-5M18 17l-5-5 5-5"} />
        </svg>
        {!collapsed && <span>Collapse</span>}
      </button>

      <div
        className={`flex items-center gap-2.5 ${collapsed ? "p-3 justify-center" : "py-3.5 px-4"}`}
        style={{ borderTop: "1px solid var(--navLine)" }}
      >
        <div
          className="rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
          style={{ width: 34, height: 34, background: "rgba(255,255,255,0.12)", color: "#FFFFFF" }}
        >
          {userEmail ? userEmail[0].toUpperCase() : "T"}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            {userEmail ? (
              <>
                <div className="text-[13px] font-semibold truncate" title={companyName ?? undefined}>
                  {companyName ?? "—"}
                </div>
                <div className="text-xs truncate" style={{ color: "var(--navMut)" }} title={userEmail}>
                  {userEmail}
                </div>
              </>
            ) : (
              <>
                <div className="text-[13px] font-semibold truncate">Default Company</div>
                <div className="text-xs truncate" style={{ color: "var(--navMut)" }}>
                  Single-tenant mode - not signed in
                </div>
              </>
            )}
          </div>
        )}
        {!collapsed && userEmail && (
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="rounded-lg flex items-center justify-center shrink-0"
            style={{ width: 32, height: 32, color: "var(--navMut)" }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
            </svg>
          </button>
        )}
      </div>
    </nav>
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
      <div
        className="px-2 py-2 text-center text-[11px]"
        style={{ borderBottom: "1px solid var(--navLine)", color: "var(--navMut)" }}
        title={`Working year: ${year}`}
      >
        {year}
      </div>
    );
  }

  return (
    <div className="px-[18px] pt-3.5 pb-1.5 flex flex-col gap-1.5" style={{ borderBottom: "1px solid var(--navLine)" }}>
      <label
        htmlFor="v2year"
        className="text-[11px] font-semibold uppercase"
        style={{ color: "var(--navMut)", letterSpacing: "0.06em" }}
      >
        Working year
      </label>
      <select
        id="v2year"
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="text-sm px-2.5"
        style={{
          height: 32,
          borderRadius: 8,
          border: "1px solid var(--navLine)",
          background: "var(--navH)",
          color: "#FFFFFF",
          colorScheme: "dark",
        }}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
