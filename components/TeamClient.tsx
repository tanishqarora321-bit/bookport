"use client";

import { useState } from "react";
import { Users, CheckCircle2, Building2 } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";

type Teammate = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
};

const ROLES = ["admin", "operations", "finance", "readonly"];

export default function TeamClient({
  initialTeammates,
  seatLimit,
  companyName,
  isAdmin,
  isPlatformOwner,
}: {
  initialTeammates: Teammate[];
  seatLimit: number;
  companyName: string;
  isAdmin: boolean;
  isPlatformOwner: boolean;
}) {
  const [teammates, setTeammates] = useState(initialTeammates);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "operations" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [onboarding, setOnboarding] = useState(false);
  const [companyForm, setCompanyForm] = useState({ companyName: "", adminEmail: "", adminName: "" });
  const [companySaving, setCompanySaving] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companySuccess, setCompanySuccess] = useState<string | null>(null);

  const activeCount = teammates.filter((t) => t.is_active).length;
  const seatsLeft = Math.max(0, seatLimit - activeCount);

  async function invite() {
    if (!form.email.trim()) {
      setError("Email is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to invite");
      setTeammates([
        ...teammates,
        { id: crypto.randomUUID(), email: form.email, full_name: form.full_name || null, role: form.role, is_active: true, created_at: new Date().toISOString() },
      ]);
      setForm({ email: "", full_name: "", role: "operations" });
      setInviting(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function createCompany() {
    if (!companyForm.companyName.trim() || !companyForm.adminEmail.trim()) {
      setCompanyError("Company name and admin email are both required.");
      return;
    }
    setCompanySaving(true);
    setCompanyError(null);
    setCompanySuccess(null);
    try {
      const res = await fetch("/api/companies/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create company");
      setCompanySuccess(`"${companyForm.companyName}" created - an invite was sent to ${companyForm.adminEmail}.`);
      setCompanyForm({ companyName: "", adminEmail: "", adminName: "" });
      setOnboarding(false);
    } catch (err: any) {
      setCompanyError(err.message);
    } finally {
      setCompanySaving(false);
    }
  }

  async function toggleActive(t: Teammate) {
    const method = t.is_active ? "DELETE" : "PATCH";
    const res = await fetch(`/api/team/${t.id}`, { method });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "Failed to update");
      return;
    }
    setTeammates(teammates.map((x) => (x.id === t.id ? { ...x, is_active: !x.is_active } : x)));
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Manage Users — {companyName}</h1>
          <p className="text-sm text-ink/40">Invited teammates sign in with email + the password they set from the invite email.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setInviting(!inviting)}
            disabled={seatsLeft <= 0}
            className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium disabled:opacity-40"
            title={seatsLeft <= 0 ? "No seats left - remove a teammate or upgrade the plan" : undefined}
          >
            + Invite Teammate
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 shrink-0">
        <StatCard icon={Users} label="Seats Used" value={`${activeCount} / ${seatLimit}`} tone={seatsLeft <= 0 ? "warning" : "default"} />
        <StatCard icon={CheckCircle2} label="Seats Left" value={seatsLeft} tone={seatsLeft <= 0 ? "danger" : "success"} />
      </div>

      {isAdmin && inviting && (
        <div className="border border-accent/30 bg-accent/5 rounded p-4 mb-4 grid grid-cols-3 gap-3">
          <input
            placeholder="Email *"
            type="email"
            className="border rounded px-2 py-1.5 text-sm"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            placeholder="Full name"
            className="border rounded px-2 py-1.5 text-sm"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <select
            className="border rounded px-2 py-1.5 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {error && <div className="col-span-3 text-xs text-cutoff">{error}</div>}
          <div className="col-span-3 flex gap-2">
            <button onClick={invite} disabled={saving} className="text-sm bg-ink text-white px-3 py-1.5 rounded">
              {saving ? "Sending invite…" : "Send Invite"}
            </button>
            <button onClick={() => setInviting(false)} className="text-sm border px-3 py-1.5 rounded">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-ink/50 border-b">
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              {isAdmin && <th className="px-3 py-2 w-24"></th>}
            </tr>
          </thead>
          <tbody>
            {teammates.map((t) => (
              <tr key={t.id} className={`border-b last:border-0 ${!t.is_active ? "opacity-40" : ""}`}>
                <td className="px-3 py-2">{t.email}</td>
                <td className="px-3 py-2 text-ink/70">{t.full_name || "—"}</td>
                <td className="px-3 py-2 text-ink/70">{t.role}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {t.is_active ? "Active" : "Removed"}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => toggleActive(t)}
                      disabled={!t.is_active && seatsLeft <= 0}
                      className={`text-xs px-2 py-1 rounded disabled:opacity-40 ${
                        t.is_active ? "text-cutoff hover:bg-red-50" : "text-accent hover:bg-blue-50"
                      }`}
                    >
                      {t.is_active ? "Remove" : "Restore"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {teammates.length === 0 && (
          <EmptyState icon={Users} title="No teammates yet" hint='Click "+ Invite Teammate" above to bring the first person in.' />
        )}
      </div>

      {isPlatformOwner && (
        <div className="mt-8 pt-6 border-t border-ink/10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                <Building2 className="w-4 h-4" size={16} /> Platform Owner: Onboard a New Client Company
              </h2>
              <p className="text-xs text-ink/40 mt-0.5">Creates the company and invites its first admin in one step. Only you can see this section.</p>
            </div>
            {!onboarding && (
              <button onClick={() => setOnboarding(true)} className="text-sm border px-3 py-1.5 rounded font-medium">
                + New Company
              </button>
            )}
          </div>

          {companySuccess && <div className="text-sm text-emerald-700 bg-emerald-50 rounded px-3 py-2 mb-3">{companySuccess}</div>}

          {onboarding && (
            <div className="border border-ink/10 bg-slate-50 rounded p-4 grid grid-cols-3 gap-3">
              <input
                placeholder="Company name *"
                className="border rounded px-2 py-1.5 text-sm"
                value={companyForm.companyName}
                onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })}
              />
              <input
                placeholder="Admin email *"
                type="email"
                className="border rounded px-2 py-1.5 text-sm"
                value={companyForm.adminEmail}
                onChange={(e) => setCompanyForm({ ...companyForm, adminEmail: e.target.value })}
              />
              <input
                placeholder="Admin name"
                className="border rounded px-2 py-1.5 text-sm"
                value={companyForm.adminName}
                onChange={(e) => setCompanyForm({ ...companyForm, adminName: e.target.value })}
              />
              {companyError && <div className="col-span-3 text-xs text-cutoff">{companyError}</div>}
              <div className="col-span-3 flex gap-2">
                <button onClick={createCompany} disabled={companySaving} className="text-sm bg-ink text-white px-3 py-1.5 rounded">
                  {companySaving ? "Creating…" : "Create Company & Invite Admin"}
                </button>
                <button onClick={() => setOnboarding(false)} className="text-sm border px-3 py-1.5 rounded">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
