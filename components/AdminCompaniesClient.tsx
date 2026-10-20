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
  active: "bg-emerald-100 text-emerald-700",
  trial: "bg-blue-100 text-blue-700",
  cancelled: "bg-line text-text-2",
  suspended: "bg-red-100 text-red-700",
};

export default function AdminCompaniesClient({ initialCompanies }: { initialCompanies: Company[] }) {
  const [companies, setCompanies] = useState(initialCompanies);

  const activeCount = companies.filter((c) => c.subscription_status === "active" || c.subscription_status === "trial").length;
  const totalSeatsUsed = companies.reduce((sum, c) => sum + c.seats_used, 0);

  async function changeStatus(id: string, status: string) {
    if (status === "cancelled" || status === "suspended") {
      const company = companies.find((c) => c.id === id);
      if (!confirm(`${status === "cancelled" ? "Cancel" : "Suspend"} "${company?.name}"? Every user there will be signed out and blocked from logging back in until you reactivate it. Their data is not touched or deleted.`)) {
        return;
      }
    }
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Platform Admin</h1>
        <p className="text-sm text-ink/40">Every client company on Ship-Sphere — only you can see this page.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard icon={Building2} label="Total Companies" value={companies.length} />
        <StatCard icon={Building2} label="Active / Trial" value={activeCount} tone="success" />
        <StatCard icon={Users} label="Total Seats Used" value={totalSeatsUsed} />
      </div>

      <div className="bg-surface rounded-xl shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-ink/50 border-b">
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Seats</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                <td className="px-4 py-3 text-ink/70">{c.admin_email}</td>
                <td className="px-4 py-3 text-ink/70">{c.seats_used} / {c.seat_limit}</td>
                <td className="px-4 py-3 text-ink/50">{new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
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
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-ink/40">No companies yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
