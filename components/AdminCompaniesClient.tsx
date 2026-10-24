"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StatusMenuButton, { StatusOption } from "@/components/ui/StatusMenuButton";
import { CloseIcon } from "@/components/EditableCell";

type TeamMember = { email: string; full_name: string | null; role: string; is_active: boolean; pending: boolean };

type Company = {
  id: string;
  name: string;
  seat_limit: number;
  subscription_status: string;
  created_at: string;
  seats_used: number;
  admin_email: string;
  admin_pending: boolean;
  team: TeamMember[];
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

type ConflictInfo = {
  companyId: string;
  companyName: string;
  adminEmail: string;
  adminName: string;
  existingCompanyName: string | null;
  // "create": came from onboarding a brand-new company. "edit": came
  // from setting/replacing an existing company's admin. Only changes
  // the success message and whether the "add company" form resets -
  // the move itself (POST /api/admin/reassign-user) is identical either way.
  mode: "create" | "edit";
};

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

  // Set/replace a company's admin - corrects a typo'd/wrong email while
  // they're still pending, or invites a new admin otherwise (see the
  // route's own comment for why an active admin's account is never
  // silently repointed).
  const [editingAdmin, setEditingAdmin] = useState<{ id: string; name: string } | null>(null);
  const [editAdminForm, setEditAdminForm] = useState({ email: "", fullName: "" });
  const [editAdminSaving, setEditAdminSaving] = useState(false);
  const [editAdminError, setEditAdminError] = useState<string | null>(null);

  // Delete only ever succeeds server-side when the company has zero team
  // members (see the DELETE route) - this just asks for confirmation and
  // surfaces whatever the server says.
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Read-only roster view - the table only ever shows one admin email per
  // company, but the platform owner managing every client's access
  // reasonably needs to see everyone on that team, not just its contact.
  const [viewingTeam, setViewingTeam] = useState<Company | null>(null);

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
      setCompanySuccess(null);
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
            mode: "create",
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
      if (conflict.mode === "edit") {
        setCompanySuccess(`"${conflict.companyName}"'s admin is now ${conflict.adminEmail}${conflict.existingCompanyName ? ` (moved from ${conflict.existingCompanyName})` : ""}.`);
      } else {
        setCompanySuccess(`"${conflict.companyName}" created - ${conflict.adminEmail}'s existing account is now its admin.`);
        setCompanyForm({ companyName: "", adminEmail: "", adminName: "", seatLimit: "5" });
      }
      setConflict(null);
      router.refresh();
    } catch (err: any) {
      setCompanyError(err.message);
      setConflict(null);
    } finally {
      setReassigning(false);
    }
  }

  function openEditAdmin(company: Company) {
    setEditingAdmin({ id: company.id, name: company.name });
    setEditAdminForm({ email: company.admin_email !== "—" ? company.admin_email : "", fullName: "" });
    setEditAdminError(null);
    setCompanySuccess(null);
  }

  async function saveAdminEdit() {
    if (!editingAdmin) return;
    if (!editAdminForm.email.trim()) {
      setEditAdminError("Email is required.");
      return;
    }
    setEditAdminSaving(true);
    setEditAdminError(null);
    try {
      const res = await fetch(`/api/admin/companies/${editingAdmin.id}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: editAdminForm.email.trim(), fullName: editAdminForm.fullName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "EMAIL_ALREADY_REGISTERED") {
          setConflict({
            companyId: json.companyId,
            companyName: json.companyName,
            adminEmail: editAdminForm.email.trim().toLowerCase(),
            adminName: editAdminForm.fullName.trim(),
            existingCompanyName: json.existingCompanyName,
            mode: "edit",
          });
          setEditingAdmin(null);
          return;
        }
        throw new Error(json.error || "Failed to update the admin");
      }
      setCompanySuccess(`"${editingAdmin.name}"'s admin ${json.mode === "updated" ? "email was corrected to" : "is now"} ${json.email}.`);
      setEditingAdmin(null);
      router.refresh();
    } catch (err: any) {
      setEditAdminError(err.message);
    } finally {
      setEditAdminSaving(false);
    }
  }

  async function deleteCompany() {
    if (!deleting) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/companies/${deleting.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to delete company");
      setCompanies((prev) => prev.filter((c) => c.id !== deleting.id));
      setCompanySuccess(`"${deleting.name}" was deleted.`);
      setDeleting(null);
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeleteSaving(false);
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
          <span style={{ flex: 1 }}>{companySuccess}</span>
          <button onClick={() => setCompanySuccess(null)} aria-label="Dismiss" className="ib">
            <CloseIcon />
          </button>
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
                    <td>
                      <button
                        type="button"
                        onClick={() => setViewingTeam(c)}
                        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", fontWeight: 600, color: "var(--accent)", textAlign: "left" }}
                      >
                        {c.name}
                      </button>
                    </td>
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
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        {c.admin_pending && c.admin_email !== "—" && (
                          <button
                            onClick={() => resendAdminInvite(c.id)}
                            disabled={resendingId === c.id}
                            className="btn btn-xs"
                          >
                            {resendingId === c.id ? "Resending…" : "Resend Invite"}
                          </button>
                        )}
                        <button onClick={() => openEditAdmin(c)} className="btn btn-xs">
                          Edit Admin
                        </button>
                        <button
                          onClick={() => {
                            setDeleting({ id: c.id, name: c.name });
                            setDeleteError(null);
                            setCompanySuccess(null);
                          }}
                          className="btn btn-xs btn-d"
                        >
                          Delete
                        </button>
                      </span>
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

      {editingAdmin && (
        <div className="scrim" onClick={() => !editAdminSaving && setEditingAdmin(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <h2 className="h2">Set admin for "{editingAdmin.name}"</h2>
              </div>
            </div>
            <div className="mb">
              <p className="lbl">
                If the current admin hasn&rsquo;t accepted their invite yet, this corrects their email and resends it. Otherwise it invites this
                email as a new admin - an admin who&rsquo;s already signed in keeps their own account either way.
              </p>
              <div className="field">
                <label htmlFor="edit-admin-email">Admin email <span className="req">*</span></label>
                <input
                  id="edit-admin-email"
                  type="email"
                  className="input"
                  value={editAdminForm.email}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-admin-name">Admin name</label>
                <input
                  id="edit-admin-name"
                  placeholder="Optional"
                  className="input"
                  value={editAdminForm.fullName}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, fullName: e.target.value })}
                />
              </div>
              {editAdminError && <div className="err">{editAdminError}</div>}
            </div>
            <div className="mf">
              <button type="button" onClick={() => setEditingAdmin(null)} disabled={editAdminSaving} className="btn btn-g">
                Cancel
              </button>
              <button type="button" onClick={saveAdminEdit} disabled={editAdminSaving} className="btn btn-p">
                {editAdminSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="scrim" onClick={() => !deleteSaving && setDeleting(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <h2 className="h2">Delete "{deleting.name}"?</h2>
              </div>
            </div>
            <div className="mb">
              <p className="lbl">
                This permanently removes the company. If it has any real bookings, invoices, documents or other activity, this is refused -
                cancel or suspend it instead so that history stays intact. If it only has unused team-member accounts (no activity anywhere),
                those accounts are removed too and their emails are freed up.
              </p>
              {deleteError && <div className="err">{deleteError}</div>}
            </div>
            <div className="mf">
              <button type="button" onClick={() => setDeleting(null)} disabled={deleteSaving} className="btn btn-g">
                Cancel
              </button>
              <button type="button" onClick={deleteCompany} disabled={deleteSaving} className="btn btn-dp">
                {deleteSaving ? "Deleting…" : "Delete Company"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingTeam && (
        <div className="scrim" onClick={() => setViewingTeam(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <h2 className="h2">"{viewingTeam.name}" team</h2>
              </div>
              <button type="button" onClick={() => setViewingTeam(null)} aria-label="Close" className="ib">
                <CloseIcon />
              </button>
            </div>
            <div style={{ borderTop: "1px solid var(--line)" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingTeam.team.map((t) => (
                    <tr key={t.email}>
                      <td>{t.email}</td>
                      <td className={t.full_name ? "" : "dash"}>{t.full_name || "—"}</td>
                      <td><span className="badge b-info">{t.role}</span></td>
                      <td>
                        <span className={`badge ${!t.is_active ? "b-neu" : t.pending ? "b-warn" : "b-ok"}`}>
                          {!t.is_active ? "Removed" : t.pending ? "Pending" : "Active"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {viewingTeam.team.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted">No team members yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
