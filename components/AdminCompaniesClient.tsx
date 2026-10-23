"use client";

import { useState } from "react";

type Company = {
  id: string;
  name: string;
  seat_limit: number;
  subscription_status: string;
  created_at: string;
  seats_used: number;
  admin_email: string;
};

// Ship-Sphere v2 design system's company-status badge map
// (design-v2/SPEC.md): Trial b-acc, Active b-ok, Suspended b-crit,
// Cancelled b-neu.
const STATUS_BADGE: Record<string, string> = {
  trial: "b-acc",
  active: "b-ok",
  suspended: "b-crit",
  cancelled: "b-neu",
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
    <div className="relative flex flex-col gap-5">
      <div>
        <h1 className="h1">Platform Admin</h1>
        <p className="sub">Every client company on Ship-Sphere — only you can see this page.</p>
      </div>

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
        <div className="tw" style={{ borderTop: "1px solid var(--line)" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Company</th>
                <th>Admin</th>
                <th style={{ minWidth: 180 }}>Seats</th>
                <th>Created</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const pct = c.seat_limit > 0 ? Math.min(100, Math.round((c.seats_used / c.seat_limit) * 100)) : 0;
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="text-text-2">{c.admin_email}</td>
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
                      <div className="relative inline-block">
                        <select
                          value={c.subscription_status}
                          onChange={(e) => changeStatus(c.id, e.target.value)}
                          aria-label={`Change status for ${c.name}`}
                          className={`badge ${STATUS_BADGE[c.subscription_status] ?? "b-neu"} appearance-none cursor-pointer`}
                          style={{ border: 0, paddingRight: 20, height: 24 }}
                        >
                          <option value="trial">Trial</option>
                          <option value="active">Active</option>
                          <option value="suspended">Suspended</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        <svg
                          aria-hidden="true"
                          className="pointer-events-none absolute"
                          style={{ right: 6, top: "50%", transform: "translateY(-50%)" }}
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
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
    </div>
  );
}
