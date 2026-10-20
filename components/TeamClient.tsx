"use client";

import { useState } from "react";
import { Users, CheckCircle2, ShieldCheck } from "lucide-react";
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
  const [companyForm, setCompanyForm] = useState({ companyName: "", adminEmail: "", adminName: "", seatLimit: "5" });
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
      setCompanyForm({ companyName: "", adminEmail: "", adminName: "", seatLimit: "5" });
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
    <>
      <section id="users" className="card" aria-labelledby="us-t" style={{ overflow: "hidden" }}>
        <div className="flex flex-wrap items-center gap-3 p-5 border-b border-line">
          <span className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0" aria-hidden="true">
            <Users size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="us-t" className="h2">Manage Users — {companyName}</h2>
            <div className="lbl mt-0.5">Invited teammates sign in with email + the password they set from the invite email.</div>
          </div>
          {isAdmin && !inviting && (
            <button
              onClick={() => setInviting(true)}
              disabled={seatsLeft <= 0}
              className="btn btn-p btn-s"
              aria-expanded={inviting}
              title={seatsLeft <= 0 ? "No seats left - remove a teammate or upgrade the plan" : undefined}
            >
              + Invite Teammate
            </button>
          )}
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 220px))", gap: 12 }}>
            <StatCard icon={Users} label="Seats Used" value={`${activeCount} / ${seatLimit}`} tone={seatsLeft <= 0 ? "warning" : "default"} />
            <StatCard icon={CheckCircle2} label="Seats Left" value={seatsLeft} tone={seatsLeft <= 0 ? "danger" : "success"} />
          </div>

          {isAdmin && inviting && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", padding: 16, borderRadius: 10, background: "var(--surf2)", border: "1px solid var(--line)" }}>
              <div className="field" style={{ flex: "2 1 220px" }}>
                <label htmlFor="invite-email">Email <span className="req">*</span></label>
                <input id="invite-email" placeholder="you@company.com" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field" style={{ flex: "1.5 1 180px" }}>
                <label htmlFor="invite-name">Full name</label>
                <input id="invite-name" placeholder="Optional" className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="field" style={{ flex: "1 1 150px" }}>
                <label htmlFor="invite-role">Role</label>
                <select id="invite-role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <button onClick={invite} disabled={saving} className="btn btn-p">
                {saving ? "Sending invite…" : "Send Invite"}
              </button>
              <button onClick={() => setInviting(false)} className="btn btn-g">
                Cancel
              </button>
              {error && <div className="err" style={{ flexBasis: "100%" }}>{error}</div>}
            </div>
          )}
        </div>

        <div className="tw" style={{ borderTop: "1px solid var(--line)" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                {isAdmin && <th><span className="sr">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {teammates.map((t) => (
                <tr key={t.id} style={!t.is_active ? { opacity: 0.6 } : undefined}>
                  <td>{t.email}</td>
                  <td className={t.full_name ? "" : "dash"}>{t.full_name || "—"}</td>
                  <td><span className="badge b-info">{t.role}</span></td>
                  <td><span className={`badge ${t.is_active ? "b-ok" : "b-neu"}`}>{t.is_active ? "Active" : "Removed"}</span></td>
                  {isAdmin && (
                    <td className="r">
                      <button
                        onClick={() => toggleActive(t)}
                        disabled={!t.is_active && seatsLeft <= 0}
                        className={`btn btn-xs ${t.is_active ? "btn-d" : ""}`}
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
      </section>

      {isPlatformOwner && (
        <section id="owner" className="card" aria-labelledby="ow-t" style={{ borderColor: "var(--accent)" }}>
          <div className="flex flex-wrap items-center gap-3 p-5 border-b border-line">
            <span className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <h2 id="ow-t" className="h2">Platform Owner: Onboard a New Client Company</h2>
              <div className="lbl mt-0.5">Creates the company and invites its first admin in one step. Only you can see this section.</div>
            </div>
            {!onboarding && (
              <button onClick={() => setOnboarding(true)} aria-expanded={onboarding} className="btn btn-s">
                + New Company
              </button>
            )}
          </div>

          <div className="p-5 flex flex-col gap-4">
            {companySuccess && (
              <div className="banner bn-ok" role="status">
                <CheckCircle2 size={18} style={{ color: "var(--ok)" }} />
                <span>{companySuccess}</span>
              </div>
            )}

            {onboarding && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                  <div className="field">
                    <label htmlFor="onb-name">Company name <span className="req">*</span></label>
                    <input id="onb-name" className="input" value={companyForm.companyName} onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="onb-email">Admin email <span className="req">*</span></label>
                    <input id="onb-email" type="email" placeholder="admin@client.com" className="input" value={companyForm.adminEmail} onChange={(e) => setCompanyForm({ ...companyForm, adminEmail: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="onb-adminname">Admin name</label>
                    <input id="onb-adminname" placeholder="Optional" className="input" value={companyForm.adminName} onChange={(e) => setCompanyForm({ ...companyForm, adminName: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="onb-seats">Seats allowed</label>
                    <input id="onb-seats" type="number" min={1} className="input num" value={companyForm.seatLimit} onChange={(e) => setCompanyForm({ ...companyForm, seatLimit: e.target.value })} />
                  </div>
                </div>
                {companyError && <div className="err">{companyError}</div>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={createCompany} disabled={companySaving} className="btn btn-p">
                    {companySaving ? "Creating…" : "Create Company & Invite Admin"}
                  </button>
                  <button onClick={() => setOnboarding(false)} className="btn btn-g">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
