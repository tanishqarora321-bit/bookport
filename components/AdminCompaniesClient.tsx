"use client";

import { useState } from "react";
import { Building2, Users } from "lucide-react";
import StatCard from "@/components/ui/StatCard";

type Company = {
  id: string;
  name: string;
  seat_limit: number;
  subscription_status: string;
  created_at: string;
  seats_used: number;
  admin_email: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-success-soft text-success",
  trial: "bg-info-soft text-info",
  cancelled: "bg-surface-2 text-text-2",
  suspended: "bg-critical-soft text-critical",
};

export default function AdminCompaniesClient({ initialCompanies }: { initialCompanies: Company[] }) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [confirming, setConfirming] = useState<{ id: string; name: string; status: string } | null>(null);
  const [applying, setApplying] = useState(false);

  const activeCount = companies.filter((c) => c.subscription_status === "active" || c.subscription_status === "trial").length;
  const trialCount = companies.filter((c) => c.subscription_status === "trial").length;
  const totalSeatsUsed = companies.reduce((sum, c) => sum + c.seats_used, 0);

  async function applyStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription_status: status }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Failed to update");
      return;
    }
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, subscription_status: json.company.subscription_status } : c)));
  }

  function changeStatus(id: string, status: string) {
    if (status === "cancelled" || status === "suspended") {
      const company = companies.find((c) => c.id === id);
      setConfirming({ id, name: company?.name ?? "", status });
      return;
    }
    applyStatus(id, status);
  }

  async function confirmChange() {
    if (!confirming) return;
    setApplying(true);
    try {
      await applyStatus(confirming.id, confirming.status);
      setConfirming(null);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Platform Admin</h1>
        <p className="text-sm text-muted">Every client company on Ship-Sphere — only you can see this page.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Building2} label="Total Companies" value={companies.length} />
        <StatCard icon={Building2} label="Active" value={activeCount} tone="success" />
        <StatCard icon={Building2} label="Trial" value={trialCount} />
        <StatCard icon={Users} label="Total Seats Used" value={totalSeatsUsed} />
      </div>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-surface-2">
            <tr className="text-left text-muted border-b border-line">
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Seats</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const pct = c.seat_limit > 0 ? Math.min(100, Math.round((c.seats_used / c.seat_limit) * 100)) : 0;
              return (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                  <td className="px-4 py-3 text-text-2">{c.admin_email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-text-2 whitespace-nowrap">{c.seats_used} / {c.seat_limit}</span>
                      <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden shrink-0">
                        <div
                          className={`h-full rounded-full ${pct >= 100 ? "bg-critical" : pct >= 75 ? "bg-warning" : "bg-accent"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td className="px-4 py-3">
                    <select
                      value={c.subscription_status}
                      onChange={(e) => changeStatus(c.id, e.target.value)}
                      className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${STATUS_COLORS[c.subscription_status] ?? "bg-surface-2 text-text-2"}`}
                    >
                      <option value="trial">Trial</option>
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                </tr>
              );
            })}
            {companies.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted">No companies yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirming && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => !applying && setConfirming(null)}>
          <div className="bg-surface border border-line rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink mb-2">
              {confirming.status === "cancelled" ? "Cancel" : "Suspend"} "{confirming.name}"?
            </h2>
            <p className="text-sm text-text-2 mb-4">
              Every user there will be signed out and blocked from logging back in until you reactivate it. Their data is not touched or deleted.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirming(null)} disabled={applying} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button onClick={confirmChange} disabled={applying} className="bg-critical text-white hover:opacity-90 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60">
                {applying ? "Applying…" : confirming.status === "cancelled" ? "Cancel Company" : "Suspend Company"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
