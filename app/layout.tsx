import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata = { title: "Bookport" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-ink min-h-screen">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 p-6 overflow-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}
