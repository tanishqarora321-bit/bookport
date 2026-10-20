import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { YearProvider } from "@/lib/year-context";
import { ThemeProvider } from "@/lib/theme-context";

export const metadata = { title: "Ship-Sphere" };

// Sets the theme class on <html> before first paint, straight from
// localStorage, so there's no flash of the wrong theme while React
// hydrates. Mirrors lib/theme-context.tsx's own storage key/classes -
// if one changes, the other must too.
const ANTI_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem("bookport:theme");if(t!=="light"&&t!=="dark"&&t!=="system")t="system";document.documentElement.classList.add("th-"+t);}catch(e){document.documentElement.classList.add("th-system");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_SCRIPT }} />
      </head>
      <body className="bg-bg text-ink min-h-screen">
        <ThemeProvider>
          <YearProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 p-6 overflow-y-auto">{children}</main>
              </div>
            </div>
          </YearProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
