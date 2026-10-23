// Shared between components/Sidebar.tsx (the nav itself) and
// components/Header.tsx (the breadcrumb) so the two can never drift -
// exact labels, grouping, icon paths and section names from
// design-v2/screens/V2Nav.dc.html, verbatim.

export type NavKey =
  | "bookings"
  | "multiple"
  | "tracking"
  | "buyers"
  | "forwarders"
  | "suppliers"
  | "truckers"
  | "freight"
  | "offers"
  | "pl"
  | "settings"
  | "admin";

export const NAV_ICON_PATHS: Record<NavKey, string> = {
  bookings: "M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M8 11h8M8 15h5",
  multiple: "M8 8h12v12H8zM4 16V4h12",
  tracking: "M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  buyers: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6",
  forwarders: "M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2",
  suppliers: "M3 21V10l5 3v-3l5 3v-3l5 3V4h3v17zM7 17h2M12 17h2M17 17h2",
  truckers: "M2 6h12v10H2zM14 10h4l3 3v3h-7M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  freight: "M5 20V11M11 20V5M17 20v-6M2 20h20",
  offers: "M5 3h14v18H5zM5 9h14M5 15h14M12 9v12",
  pl: "M3 17l6-6 4 4 8-8M15 7h6v6",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  admin: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
};

export type NavItem = { key: NavKey; label: string; href: string; badgeKey?: "duplicateBookings" };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { key: "bookings", label: "Booking & Instructions", href: "/bookings" },
      { key: "multiple", label: "Multiple Bookings", href: "/bookings/multiple", badgeKey: "duplicateBookings" },
      { key: "tracking", label: "Shipment Tracking", href: "/tracking" },
    ],
  },
  {
    label: "Partners",
    items: [
      { key: "buyers", label: "Buyers / Customers", href: "/parties" },
      { key: "forwarders", label: "Forwarders", href: "/forwarders" },
      { key: "suppliers", label: "Suppliers", href: "/suppliers" },
      { key: "truckers", label: "Truckers", href: "/truckers" },
    ],
  },
  {
    label: "Commercial",
    items: [
      { key: "freight", label: "Freight Comparison", href: "/freight-comparison" },
      { key: "offers", label: "Offer Sheet", href: "/offer-sheets" },
    ],
  },
  { label: "Finance", items: [{ key: "pl", label: "Profit & Loss", href: "/profit-loss" }] },
  {
    label: "Workspace",
    items: [
      { key: "settings", label: "Settings & Control", href: "/team" },
      { key: "admin", label: "Platform Admin", href: "/admin" },
    ],
  },
];

// Flat lookup for the Header's breadcrumb (SECTION > PAGE).
export const NAV_BY_KEY: Record<NavKey, { label: string; section: string; href: string }> = NAV_GROUPS.reduce(
  (acc, g) => {
    for (const it of g.items) acc[it.key] = { label: it.label, section: g.label, href: it.href };
    return acc;
  },
  {} as Record<NavKey, { label: string; section: string; href: string }>
);

// Matches a pathname to its nav key - same prefix logic Sidebar used
// before, centralized so Header's breadcrumb agrees with which item
// the sidebar highlights.
export function navKeyForPathname(pathname: string | null): NavKey | null {
  if (!pathname) return null;
  if (pathname.startsWith("/bookings/multiple")) return "multiple";
  if (pathname.startsWith("/bookings")) return "bookings";
  if (pathname.startsWith("/tracking")) return "tracking";
  if (pathname.startsWith("/parties")) return "buyers";
  if (pathname.startsWith("/forwarders")) return "forwarders";
  if (pathname.startsWith("/suppliers")) return "suppliers";
  if (pathname.startsWith("/truckers")) return "truckers";
  if (pathname.startsWith("/freight-comparison")) return "freight";
  if (pathname.startsWith("/offer-sheets")) return "offers";
  if (pathname.startsWith("/profit-loss")) return "pl";
  if (pathname.startsWith("/team")) return "settings";
  if (pathname.startsWith("/admin")) return "admin";
  return null;
}
