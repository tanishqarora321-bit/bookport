"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

// /login and /auth/callback are pre-auth screens that render their own
// full-bleed, edge-to-edge layout (see app/login/page.tsx) - Sidebar
// already knows to render nothing for these paths, but leaving them
// wrapped in the authenticated app shell's <main className="p-6"> still
// boxed them in with 24px of padding on every side and forced a vertical
// scrollbar (that page's own min-h-screen/h-screen layout wants the full
// viewport, which no longer fit once the shell's padding ate into it).
// Skipping the shell entirely for these paths is what actually gives
// them the whole viewport.
const PRE_AUTH_PATHS = ["/login", "/auth/callback"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (PRE_AUTH_PATHS.some((p) => pathname?.startsWith(p))) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 p-6 overflow-y-auto">{children}</main>
    </div>
  );
}
