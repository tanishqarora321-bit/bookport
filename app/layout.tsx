import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { YearProvider } from "@/lib/year-context";
import { ThemeProvider } from "@/lib/theme-context";
import ThemeToggle from "@/components/ui/ThemeToggle";

export const metadata = { title: "Ship-Sphere" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-ink min-h-screen">
        <ThemeProvider>
          <YearProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Foundation-only top bar for now - each page's own header
                    (breadcrumb, title, actions) gets this toggle woven in
                    directly as pages are reskinned in the next phase. */}
                <div className="flex justify-end px-6 py-2 border-b border-line bg-surface shrink-0">
                  <ThemeToggle />
                </div>
                <main className="flex-1 p-6 overflow-y-auto">{children}</main>
              </div>
            </div>
          </YearProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
