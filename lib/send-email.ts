// Generic email sender - Instructions is the first caller, but this is
// deliberately not Instructions-specific ("we need to mail some more
// things also in the future"). Calls Resend's plain REST API via fetch
// rather than adding the `resend` package as a dependency - the API is
// a single POST, not worth a new npm install for.
export type SendEmailInput = {
  companyId: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  bookingId?: string | null;
  emailType?: string;
};

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string };

export async function sendEmail(supabase: any, input: SendEmailInput): Promise<SendEmailResult> {
  const { data: settings } = await supabase
    .from("company_email_settings")
    .select("provider, api_key, from_email, from_name")
    .eq("company_id", input.companyId)
    .maybeSingle();

  if (!settings?.api_key || !settings?.from_email) {
    const error = "Email sending isn't set up yet - add a Resend API key and From address in Settings & Control.";
    await logSentEmail(supabase, input, "failed", error, null);
    return { ok: false, error };
  }

  if (settings.provider !== "resend") {
    const error = `Unsupported email provider "${settings.provider}"`;
    await logSentEmail(supabase, input, "failed", error, null);
    return { ok: false, error };
  }

  const from = settings.from_name ? `${settings.from_name} <${settings.from_email}>` : settings.from_email;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
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
