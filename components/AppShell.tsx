"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

// /login and /auth/callback are pre-auth screens that render their own
// full-bleed, edge-to-edge layout (see app/login/page.tsx) - Sidebar and
// Header already know to render nothing for these paths, but leaving them
// wrapped in the authenticated app shell's <main className="p-6"> still
// boxed them in with 24px of padding on every side and forced a vertical
// scrollbar (that div's own min-h-screen wants the full viewport height,
// which no longer fits once the shell's padding eats into it). Skipping
// the shell entirely for these paths is what actually gives them the
// whole viewport.
const PRE_AUTH_PATHS = ["/login", "/auth/callback"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (PRE_AUTH_PATHS.some((p) => pathname?.startsWith(p))) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen overflow-hidden">
      <Sidebar />
      {/* Sidebar is position:fixed (see components/Sidebar.tsx) so a page's
          own content can never drag it into a page-level scroll - this
          column reserves the matching width as a margin instead of relying
          on flexbox, since a fixed element no longer takes part in normal
          layout at all. The --sidebar-w custom property is kept in sync by
          Sidebar itself as it expands/collapses. */}
      <div
        className="h-screen flex flex-col overflow-hidden transition-[margin-left] duration-150"
        style={{ marginLeft: "var(--sidebar-w, 244px)" }}
      >
        <Header />
        <main className="app-main flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
