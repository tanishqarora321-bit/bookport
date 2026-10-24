"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";

type Teammate = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  // Hasn't clicked their invite link yet (auth.users.email_confirmed_at
  // is still null) - still counts as a used seat (same as before), but
  // can have its invite resent rather than being stuck once the first
  // email's link is lost or expires.
  pending: boolean;
};

const ROLES = ["admin", "operations", "finance", "readonly"];

export default function TeamClient({
  initialTeammates,
  seatLimit,
  companyName,
  isAdmin,
}: {
  initialTeammates: Teammate[];
  seatLimit: number;
  companyName: string;
  isAdmin: boolean;
}) {
  const [teammates, setTeammates] = useState(initialTeammates);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "operations" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const activeCount = teammates.filter((t) => t.is_active).length;
  const seatsLeft = Math.max(0, seatLimit - activeCount);

  async function resendInvite(id: string) {
    setResendingId(id);
    setResendMessage(null);
    try {
      const res = await fetch(`/api/team/${id}/resend`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to resend invite");
      setResendMessage(`Invite resent to ${json.email}.`);
    } catch (err: any) {
      setResendMessage(err.message);
    } finally {
      setResendingId(null);
    }
  }

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
        { id: crypto.randomUUID(), email: form.email, full_name: form.full_name || null, role: form.role, is_active: true, created_at: new Date().toISOString(), pending: true },
      ]);
      setForm({ email: "", full_name: "", role: "operations" });
      setInviting(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
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
        <div className="ch">
          <span className="cico" aria-hidden="true">
            <Users size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="us-t" className="h2">Manage Users — {companyName}</h2>
            <div className="lbl mt-0.5">Invite teammates and manage workspace access.</div>
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

        <div className="sdet">
          <div className="sfield">
            <span>Seats used</span>
            <strong>{activeCount} / {seatLimit}</strong>
          </div>
          <div className="sfield">
            <span>Seats remaining</span>
            <strong>{seatsLeft}</strong>
          </div>
        </div>

        {(inviting || resendMessage) && (
        <div className="cb">
          {resendMessage && <div className="meta" style={{ color: "var(--ok)", fontWeight: 600 }}>{resendMessage}</div>}
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
        )}

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
                  <td>
                    <span className={`badge ${!t.is_active ? "b-neu" : t.pending ? "b-warn" : "b-ok"}`}>
                      {!t.is_active ? "Removed" : t.pending ? "Pending" : "Active"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="r">
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        {t.is_active && t.pending && (
                          <button
                            onClick={() => resendInvite(t.id)}
                            disabled={resendingId === t.id}
                            className="btn btn-xs"
                          >
                            {resendingId === t.id ? "Resending…" : "Resend Invite"}
                          </button>
                        )}
                        <button
                          onClick={() => toggleActive(t)}
                          disabled={!t.is_active && seatsLeft <= 0}
                          className={`btn btn-xs ${t.is_active ? "btn-d" : ""}`}
                        >
                          {t.is_active ? "Remove" : "Restore"}
                        </button>
                      </span>
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
    </>
  );
}
