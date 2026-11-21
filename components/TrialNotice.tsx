"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TRIAL_WARNING_DAYS, todayIST } from "@/lib/trial";

// Free-trial reminders (owner, 2026-11; lib/trial.ts):
//  - last 5 days of a trial: a popup once a day ("Your free trial ends in
//    N days") with Request recharge / Remind me later;
//  - trial over: a screen the user can't dismiss - Request recharge or
//    Sign out (the server already refuses their data requests).
// The platform owner never sees either.
type Me = { user: { trial: { endsAt: string; daysLeft: number; expired: boolean } | null; company_name: string } | null; trial_expired?: { company_name: string; ends_at: string } | null };

const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function TrialNotice() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((j: Me) => {
        setMe(j);
        let seen = null;
        try {
          seen = localStorage.getItem("bp:trial-popup");
        } catch {
          /* ignore */
        }
        setDismissed(seen === todayIST());
      })
      .catch(() => {});
    // Re-check on each module switch: cheap, and catches a trial ending mid-session.
  }, [pathname]);

  const trial = me?.user?.trial ?? null;
  const expired = me?.trial_expired ?? null;
  const warn = trial && !trial.expired && trial.daysLeft <= TRIAL_WARNING_DAYS;
  if (!expired && (!warn || dismissed)) return null;

  function later() {
    try {
      localStorage.setItem("bp:trial-popup", todayIST());
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  async function requestRecharge() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/trial/recharge-request", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't send the request.");
      setSent(json.already ? "We already have your request - we'll contact you shortly." : "Request sent - we'll contact you shortly to recharge your account.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  const days = trial?.daysLeft ?? 0;
  const title = expired ? "Your free trial has ended" : days === 0 ? "Your free trial ends today" : `Your free trial ends in ${days} day${days === 1 ? "" : "s"}`;
  const body = expired
    ? `The free trial for ${expired.company_name} ended on ${fmt(expired.ends_at)}. Recharge your account to keep using Ship-Sphere - your data is safe and will be right here.`
    : `The free trial for ${me?.user?.company_name ?? "your company"} ends on ${fmt(trial!.endsAt)}. Recharge your account to keep using Ship-Sphere without interruption.`;

  return (
    <div className="scrim" style={{ zIndex: 1000 }} onClick={() => !expired && later()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="trial-t" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <h2 id="trial-t" className="h2">{title}</h2>
        </div>
        <div className="mb">
          <p className="lbl" style={{ lineHeight: 1.6 }}>{body}</p>
          {sent && <div className="banner bn-ok" role="status" style={{ marginTop: 12 }}>{sent}</div>}
          {error && <div className="err" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <div className="mf">
          {expired ? (
            <button className="btn btn-g" onClick={signOut}>Sign out</button>
          ) : (
            <button className="btn btn-g" onClick={later}>Remind me later</button>
          )}
          <button className="btn btn-p" onClick={requestRecharge} disabled={sending || !!sent}>
            {sending ? "Sending…" : sent ? "Request sent" : "Request recharge"}
          </button>
        </div>
      </div>
    </div>
  );
}
