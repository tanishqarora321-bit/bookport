import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile, getExpiredTrialInfo } from "@/lib/supabase/session";
import { sendEmail } from "@/lib/send-email";
import { OWNER_NOTIFY_EMAIL } from "@/lib/trial";

// "Request recharge" on the trial popup / trial-ended screen: emails the
// platform owner who is asking. Works for a company whose trial already
// ended (getCurrentProfile() is null for them, so getExpiredTrialInfo()
// identifies them from the verified session). Once an hour per company.
export async function POST() {
  const me = await getCurrentProfile();
  const expired = me ? null : await getExpiredTrialInfo();
  if (!me && !expired) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();
  const hdrUser = me ? { email: me.email, name: me.full_name ?? "" } : { email: expired!.email, name: "" };
  const companyId = me?.company_id ?? expired!.company_id;
  const companyName = me?.company_name ?? expired!.company_name;
  const endsAt = me?.trial?.endsAt ?? expired!.ends_at;

  const { count } = await supabase
    .from("sent_emails")
    .select("id", { count: "exact", head: true })
    .eq("email_type", "recharge_request")
    .eq("company_id", companyId)
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) > 0) return NextResponse.json({ ok: true, already: true });

  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const result = await sendEmail(supabase, {
    companyId,
    to: [OWNER_NOTIFY_EMAIL],
    subject: `Recharge request: ${companyName}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">
  <p><b>${esc(companyName)}</b> wants to recharge their Ship-Sphere account.</p>
  <p>Requested by: ${esc(hdrUser.name ? `${hdrUser.name} - ` : "")}${esc(hdrUser.email)}<br>Trial ${expired ? "ended" : "ends"}: ${esc(endsAt)}</p>
  <p>After payment, set the company to <b>Active</b> (or move its trial end date) in Platform Admin.</p>
</div>`,
    replyTo: hdrUser.email || undefined,
    emailType: "recharge_request",
    fromNameOverride: "Ship-Sphere",
  });
  if (!result.ok) return NextResponse.json({ error: "Couldn't send the request right now - please try again later." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
