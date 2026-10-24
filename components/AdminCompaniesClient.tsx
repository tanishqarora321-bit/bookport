"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StatusMenuButton, { StatusOption } from "@/components/ui/StatusMenuButton";

type Company = {
  id: string;
  name: string;
  seat_limit: number;
  subscription_status: string;
  created_at: string;
  seats_used: number;
  admin_email: string;
  admin_pending: boolean;
};

// Ship-Sphere v2 design system's company-status badge map
// (design-v2/SPEC.md): Trial b-acc, Active b-ok, Suspended b-crit,
// Cancelled b-neu.
const STATUS_OPTIONS: StatusOption[] = [
  { value: "trial", label: "Trial", badgeClass: "b-acc" },
  { value: "active", label: "Active", badgeClass: "b-ok" },
  { value: "suspended", label: "Suspended", badgeClass: "b-crit" },
  { value: "cancelled", label: "Cancelled", badgeClass: "b-neu" },
];

type ConflictInfo = { companyId: string; companyName: string; adminEmail: string; adminName: string; existingCompanyName: string | null };

export default function AdminCompaniesClient({ initialCompanies }: { initialCompanies: Company[] }) {
  const router = useRouter();
  const [companies, setCompanies] = useState(initialCompanies);

  // router.refresh() (after creating a company or reassigning an admin)
  // re-fetches this page's server data and hands fresh props down, but
  // useState(initialCompanies) only reads that prop once on mount -
  // without this, the table would keep showing pre-refresh data until a
  // full reload.
  useEffect(() => {
    setCompanies(initialCompanies);
  }, [initialCompanies]);
  const [confirming, setConfirming] = useState<{ id: string; name: string; status: string } | null>(null);
  const [applying, setApplying] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // Onboard a new client company - moved here from Settings & Control
  // (Platform Owner belongs with the rest of the platform-wide company
  // management, not mixed into one company's own settings page).
  const [adding, setAdding] = useState(false);
  const [companyForm, setCompanyForm] = useState({ companyName: "", adminEmail: "", adminName: "", seatLimit: "5" });
  const [companySaving, setCompanySaving] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companySuccess, setCompanySuccess] = useState<string | null>(null);
  // Set when /api/companies/create reports the admin email already has a
  // real (confirmed) account elsewhere - Supabase refuses to invite an
  // already-registered email, and that account can't be deleted and
  // recreated (bookings/documents/amendments/audit_log all reference
  // profiles(id) with no ON DELETE). Moving their existing account to
  // this new company is the safe fix; this holds what's needed to do that
  // once the platform owner confirms it's the right person.
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [reassigning, setReassigning] = useState(false);

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

  async function resendAdminInvite(id: string) {
    setResendingId(id);
    setResendMessage(null);
    try {
      const res = await fetch(`/api/admin/companies/${id}/resend-admin-invite`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to resend invite");
      setResendMessage(`Invite resent to ${json.email}.`);
    } catch (err: any) {
      setResendMessage(err.message);
    } finally {
      setResendingId(null);
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
      if (!res.ok) {
        if (json.code === "EMAIL_ALREADY_REGISTERED") {
          setConflict({
            companyId: json.companyId,
            companyName: json.companyName,
            adminEmail: companyForm.adminEmail.trim().toLowerCase(),
            adminName: companyForm.adminName.trim(),
            existingCompanyName: json.existingCompanyName,
          });
          setAdding(false);
          return;
        }
        throw new Error(json.error || "Failed to create company");
      }
      setCompanySuccess(`"${companyForm.companyName}" created - an invite was sent to ${companyForm.adminEmail}.`);
      setCompanyForm({ companyName: "", adminEmail: "", adminName: "", seatLimit: "5" });
      setAdding(false);
      router.refresh();
    } catch (err: any) {
      setCompanyError(err.message);
    } finally {
      setCompanySaving(false);
    }
  }

  async function confirmReassign() {
    if (!conflict) return;
    setReassigning(true);
    try {
      const res = await fetch("/api/admin/reassign-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: conflict.adminEmail, companyId: conflict.companyId, fullName: conflict.adminName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to move the account");
      setCompanySuccess(`"${conflict.companyName}" created - ${conflict.adminEmail}'s existing account is now its admin.`);
      setCompanyForm({ companyName: "", adminEmail: "", adminName: "", seatLimit: "5" });
      setConflict(null);
      router.refresh();
    } catch (err: any) {
      setCompanyError(err.message);
      setConflict(null);
    } finally {
      setReassigning(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">Platform Admin</h1>
          <p className="sub">Every client company on Ship-Sphere — only you can see this page.</p>
        </div>
        {!adding && (
          <button type="button" onClick={() => { setAdding(true); setCompanySuccess(null); }} className="btn btn-p">
            + Add Company
          </button>
        )}
      </div>

      {companySuccess && (
        <div className="banner bn-ok" role="status">
          <span>{companySuccess}</span>
        </div>
      )}

      {adding && (
        <section className="card" aria-labelledby="add-co-t">
          <div className="ch">
            <div className="flex-1 min-w-0">
              <h2 id="add-co-t" className="h2">Add company</h2>
              <div className="lbl mt-0.5">Creates the company and invites its first admin in one step.</div>
            </div>
          </div>
          <div className="cb">
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
              <button onClick={() => setAdding(false)} className="btn btn-g">
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      <section aria-label="Totals" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <div className="card kpi">
          <span className="lbl">Total Companies</span>
          <span className="v">{companies.length}</span>
          <span className="meta">All time</span>
        </div>
        <div className="card kpi">
          <span className="lbl">Active</span>
          <span className="v" style={{ color: "var(--ok)" }}>{activeCount}</span>
          <span className="meta">Paying, signed in</span>
        </div>
        <div className="card kpi">
          <span className="lbl">Trial</span>
          <span className="v" style={{ color: "var(--accent)" }}>{trialCount}</span>
          <span className="meta">Pilot accounts</span>
        </div>
        <div className="card kpi">
          <span className="lbl">Total Seats Used</span>
          <span className="v">{totalSeatsUsed}</span>
          <span className="meta">Across all companies</span>
        </div>
      </section>

      <section className="card" aria-labelledby="co-t">
        <div className="flex items-center justify-between" style={{ padding: "16px 18px" }}>
          <h2 id="co-t" className="h2">Client companies</h2>
        </div>
        {resendMessage && <div className="meta" style={{ padding: "0 18px 12px", color: "var(--ok)", fontWeight: 600 }}>{resendMessage}</div>}
        <div className="tw" style={{ borderTop: "1px solid var(--line)" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Company</th>
                <th>Admin</th>
                <th style={{ minWidth: 180 }}>Seats</th>
                <th>Created</th>
                <th>Status</th>
                <th><span className="sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const pct = c.seat_limit > 0 ? Math.min(100, Math.round((c.seats_used / c.seat_limit) * 100)) : 0;
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="text-text-2">
                      {c.admin_email}
                      {c.admin_pending && c.admin_email !== "—" && <span className="badge b-warn" style={{ marginLeft: 8 }}>Pending</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 overflow-hidden shrink-0" style={{ height: 6, borderRadius: 3, background: "var(--neuS)" }}>
                          <div
                            className={pct >= 100 ? "bg-critical" : pct >= 75 ? "bg-warning" : "bg-accent"}
                            style={{ width: `${pct}%`, height: "100%" }}
                          />
                        </div>
                        <span className="num whitespace-nowrap">{c.seats_used} / {c.seat_limit}</span>
                      </div>
                    </td>
                    <td className="num text-muted">{new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td>
                      <StatusMenuButton
                        value={c.subscription_status}
                        options={STATUS_OPTIONS}
                        onChange={(next) => changeStatus(c.id, next)}
                        ariaLabel={`Change status for ${c.name}`}
                      />
                    </td>
                    <td className="r">
                      {c.admin_pending && c.admin_email !== "—" && (
                        <button
                          onClick={() => resendAdminInvite(c.id)}
                          disabled={resendingId === c.id}
                          className="btn btn-xs"
                        >
                          {resendingId === c.id ? "Resending…" : "Resend Invite"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">No companies yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {confirming && (
        <div className="scrim" onClick={() => !applying && setConfirming(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <h2 className="h2">
                  {confirming.status === "cancelled" ? "Cancel" : "Suspend"} "{confirming.name}"?
                </h2>
              </div>
            </div>
            <div className="mb">
              <p className="lbl">
                Every user there will be signed out and blocked from logging back in until you reactivate it. Their data is not touched or deleted.
              </p>
            </div>
            <div className="mf">
              <button type="button" onClick={() => setConfirming(null)} disabled={applying} className="btn btn-g">
                Cancel
              </button>
              <button type="button" onClick={confirmChange} disabled={applying} className="btn btn-dp">
                {applying ? "Applying…" : confirming.status === "cancelled" ? "Cancel Company" : "Suspend Company"}
              </button>
            </div>
          </div>
        </div>
      )}

      {conflict && (
        <div className="scrim" onClick={() => !reassigning && setConflict(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <h2 className="h2">Move this account to "{conflict.companyName}"?</h2>
              </div>
            </div>
            <div className="mb">
              <p className="lbl">
                <b className="text-ink font-semibold">{conflict.adminEmail}</b> already has an account on Ship-Sphere
                {conflict.existingCompanyName ? (
                  <>
                    {" "}(currently under <b className="text-ink font-semibold">{conflict.existingCompanyName}</b>)
                  </>
                ) : null}
                . Moving it here makes it the admin of <b className="text-ink font-semibold">{conflict.companyName}</b> instead - their
                sign-in and password stay the same, and nothing about their past activity is deleted or changed.
              </p>
            </div>
            <div className="mf">
              <button type="button" onClick={() => setConflict(null)} disabled={reassigning} className="btn btn-g">
                Cancel
              </button>
              <button type="button" onClick={confirmReassign} disabled={reassigning} className="btn btn-p">
                {reassigning ? "Moving…" : "Move Account Here"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
