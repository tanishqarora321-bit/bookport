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
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
