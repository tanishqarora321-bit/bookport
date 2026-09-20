"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ship, Container, MapPinned, FileCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/ui/Logo";

const FEATURES = [
  { icon: Container, text: "One booking, every party synced automatically" },
  { icon: MapPinned, text: "Live tracking from cutoff to delivery" },
  { icon: FileCheck2, text: "Documents, invoices and P&L in one place" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push("/bookings");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-[#0b2749] via-[#123a6b] to-accent">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 60% 70%, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/15 backdrop-blur flex items-center justify-center w-11 h-11 shrink-0">
              <Ship className="text-white" size={24} strokeWidth={2.25} />
            </div>
            <div>
              <div className="font-semibold text-lg leading-tight">Ship-Sphere</div>
              <div className="text-xs text-white/60 leading-tight">One Booking. All Connected.</div>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="text-3xl font-semibold leading-tight mb-4">
              Freight forwarding, without the spreadsheet chaos.
            </h1>
            <p className="text-white/70 text-sm leading-relaxed mb-8">
              Bookings, tracking, documents and invoicing for your whole team — kept in sync, in one
              place, for every client you manage.
            </p>
            <div className="space-y-4">
              {FEATURES.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="rounded-full bg-white/10 w-8 h-8 flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-white" />
                  </div>
                  <span className="text-sm text-white/85">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-white/40">© {new Date().getFullYear()} Ship-Sphere. All rights reserved.</div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 justify-center lg:hidden">
            <Logo size={40} />
            <div>
              <div className="font-semibold text-lg leading-tight text-ink">Ship-Sphere</div>
              <div className="text-xs text-slate-400 leading-tight">One Booking. All Connected.</div>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-ink mb-1">Welcome back</h1>
            <p className="text-sm text-ink/40">Sign in to your Ship-Sphere account.</p>
          </div>

          <form onSubmit={signIn} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Email</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-ink/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-ink/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-sm text-cutoff bg-red-50 rounded-lg px-3 py-2">{error}</div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-accent hover:bg-accent/90 transition text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {saving ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-xs text-slate-400 text-center pt-2">
              Don't have an account yet? Ask your admin to invite you from Settings & Control.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
