"use client";

import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { NAV_BY_KEY, navKeyForPathname } from "@/lib/nav";

// Matches design-v2/SPEC.md's shell <header> exactly: breadcrumb on the
// left (SECTION › PAGE), the Light/Dark/System switch on the right.
export default function Header() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/auth/callback") return null;

  const key = navKeyForPathname(pathname);
  const entry = key ? NAV_BY_KEY[key] : null;

  return (
    <header
      className="flex flex-wrap items-center gap-3 shrink-0"
      style={{ minHeight: 58, padding: "8px 20px", background: "var(--surf)", borderBottom: "1px solid var(--line)" }}
    >
      <nav aria-label="Breadcrumb" className="lbl flex-1">
        {entry ? (
          <>
            {entry.section} <span aria-hidden="true">›</span>{" "}
            <span style={{ color: "var(--tx)", fontWeight: 600 }}>{entry.label}</span>
          </>
        ) : (
          <span style={{ color: "var(--tx)", fontWeight: 600 }}>Ship-Sphere</span>
        )}
      </nav>
      <ThemeToggle />
    </header>
  );
}
