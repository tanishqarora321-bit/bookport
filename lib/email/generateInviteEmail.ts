// Invite/onboarding emails route through Resend now, not Supabase's own
// built-in auth email sending - the free-tier Supabase SMTP is rate-
// limited and unreliable (confirmed: a real "Onboard New Client Company"
// invite never arrived). supabase.auth.admin.generateLink() creates the
// same user Supabase's inviteUserByEmail() would, but returns the
// action_link instead of emailing it - we send that link ourselves.
function escapeHtml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function generateTeamInviteEmail(opts: { companyName: string; actionLink: string }): { subject: string; html: string } {
  const subject = `You're invited to join ${opts.companyName} on Ship-Sphere`;
  const html = `
<div style="font-family:Calibri,Arial,sans-serif;font-size:15px;color:#111;line-height:1.6;max-width:480px;">
  <p>Hi,</p>
  <p>You've been invited to join <b>${escapeHtml(opts.companyName)}</b> on Ship-Sphere.</p>
  <p style="margin:24px 0;">
    <a href="${opts.actionLink}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Accept Invite &amp; Set Password</a>
  </p>
  <p style="color:#666;font-size:13px;">If the button doesn't work, paste this link into your browser:<br><a href="${opts.actionLink}">${opts.actionLink}</a></p>
</div>`.trim();
  return { subject, html };
}

export function generateCompanyOnboardingEmail(opts: { companyName: string; actionLink: string }): { subject: string; html: string } {
  const subject = `Welcome to Ship-Sphere - set up ${opts.companyName}`;
  const html = `
<div style="font-family:Calibri,Arial,sans-serif;font-size:15px;color:#111;line-height:1.6;max-width:480px;">
  <p>Hi,</p>
  <p>An account has been created for <b>${escapeHtml(opts.companyName)}</b> on Ship-Sphere, and you've been set up as its admin.</p>
  <p style="margin:24px 0;">
    <a href="${opts.actionLink}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Set Your Password &amp; Sign In</a>
  </p>
  <p style="color:#666;font-size:13px;">If the button doesn't work, paste this link into your browser:<br><a href="${opts.actionLink}">${opts.actionLink}</a></p>
</div>`.trim();
  return { subject, html };
}
