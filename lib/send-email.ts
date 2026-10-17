// Generic email sender - Instructions is the first caller, but this is
// deliberately not Instructions-specific ("we need to mail some more
// things also in the future"). Calls Resend's plain REST API via fetch
// rather than adding the `resend` package as a dependency - the API is
// a single POST, not worth a new npm install for.
//
// One platform-wide Resend account/domain sends for every company (see
// migration 0027) - RESEND_API_KEY and PLATFORM_EMAIL_FROM_ADDRESS are
// env vars, same as GEMINI_API_KEY, not a per-company DB row. Each
// company's own display name/reply-to (company_email_settings) is
// optional personalization layered on top, not a requirement gate -
// sending already works the moment the env vars are set, with zero
// per-client setup.
const DEFAULT_FROM_ADDRESS = "notifications@ship-sphere.com";

export type SendEmailInput = {
  companyId: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  bookingId?: string | null;
  emailType?: string;
  // Platform-level emails (e.g. inviting the admin of a brand-new company
  // that has no letterhead/branding of its own yet) should read as coming
  // from Ship-Sphere itself, not from company_email_settings/companies.name.
  fromNameOverride?: string;
};

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string };

export async function sendEmail(supabase: any, input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const error = "Email sending isn't configured on this deployment yet - RESEND_API_KEY is missing.";
    await logSentEmail(supabase, input, "failed", error, null);
    return { ok: false, error };
  }

  const [{ data: settings }, { data: company }] = await Promise.all([
    supabase.from("company_email_settings").select("from_name, reply_to").eq("company_id", input.companyId).maybeSingle(),
    supabase.from("companies").select("name").eq("id", input.companyId).single(),
  ]);

  const fromAddress = process.env.PLATFORM_EMAIL_FROM_ADDRESS || DEFAULT_FROM_ADDRESS;
  const displayName = input.fromNameOverride || settings?.from_name || company?.name || "Ship-Sphere";
  const from = `${displayName} <${fromAddress}>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
        reply_to: settings?.reply_to || undefined,
        subject: input.subject,
        html: input.html,
      }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const error = json?.message || `Resend returned ${res.status}`;
      await logSentEmail(supabase, input, "failed", error, null);
      return { ok: false, error };
    }

    await logSentEmail(supabase, input, "sent", null, json?.id ?? null);
    return { ok: true, id: json?.id ?? null };
  } catch (err: any) {
    const error = err?.message || "Network error sending email";
    await logSentEmail(supabase, input, "failed", error, null);
    return { ok: false, error };
  }
}

async function logSentEmail(
  supabase: any,
  input: SendEmailInput,
  status: "sent" | "failed",
  errorMessage: string | null,
  providerMessageId: string | null
) {
  await supabase.from("sent_emails").insert({
    company_id: input.companyId,
    booking_id: input.bookingId ?? null,
    email_type: input.emailType ?? "other",
    to_addresses: input.to,
    cc_addresses: input.cc ?? [],
    subject: input.subject,
    body_html: input.html,
    status,
    error_message: errorMessage,
    provider_message_id: providerMessageId,
  });
}
