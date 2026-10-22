import "./globals.css";
import AppShell from "@/components/AppShell";
import { YearProvider } from "@/lib/year-context";

export const metadata = { title: "Ship-Sphere" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-ink min-h-screen">
        <YearProvider>
          <AppShell>{children}</AppShell>
        </YearProvider>
      </body>
    </html>
  );
}
