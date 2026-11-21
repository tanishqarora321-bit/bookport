import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/send-email";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

// "Request a demo" / "Get in touch" on the public landing page (owner,
// 2026-11): emails the visitor's details to the owner, with Reply-To set to
// the visitor so a plain "Reply" answers them. This route is PUBLIC (no
// sign-in), so it is defended against spam and abuse:
//   - strict validation and length limits; all values HTML-escaped;
//   - a hidden honeypot field and a minimum fill time (bots get a fake "ok");
//   - rate limits: per IP (per server instance), per visitor email
//     (3 a day) and overall (30 an hour), the last two counted from the
//     sent_emails log so they hold across instances.
const DEMO_REQUEST_TO = process.env.DEMO_REQUEST_TO || "tanishqarora321@gmail.com";
const EMAIL_TYPE = "demo_request";

const ipHits = new Map<string, number[]>();
function ipLimited(ip: string) {
  const now = Date.now();
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  ipHits.set(ip, recent);
  if (ipHits.size > 5000) ipHits.clear();
  return recent.length > 3;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ");

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Bots: fill the hidden field or submit instantly. Pretend it worked.
  if (clean(body.website, 200) || Number(body.elapsed_ms) < 2500) return NextResponse.json({ ok: true });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (ipLimited(ip)) return NextResponse.json({ error: "Too many requests - please try again in a few minutes." }, { status: 429 });

  const name = oneLine(clean(body.name, 100));
  const email = oneLine(clean(body.email, 200)).toLowerCase();
  const phone = oneLine(clean(body.phone, 30));
  const company = oneLine(clean(body.company, 150));
  const message = clean(body.message, 2000);

  if (name.length < 2) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  const digits = phone.replace(/\D/g, "");
  if (!/^[+\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
    return NextResponse.json({ error: "Please enter a valid phone number (with country code)." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const [{ count: lastHour }, { count: sameEmail }] = await Promise.all([
    supabase.from("sent_emails").select("id", { count: "exact", head: true }).eq("email_type", EMAIL_TYPE).gte("created_at", hourAgo),
    supabase.from("sent_emails").select("id", { count: "exact", head: true }).eq("email_type", EMAIL_TYPE).gte("created_at", dayAgo).ilike("subject", `%<${email}>%`),
  ]);
  if ((sameEmail ?? 0) >= 3) return NextResponse.json({ error: "We already have your request - we'll be in touch soon." }, { status: 429 });
  if ((lastHour ?? 0) >= 30) return NextResponse.json({ error: "We're receiving a lot of requests right now - please try again later." }, { status: 429 });

  const row = (label: string, value: string) =>
    value ? `<tr><td style="padding:6px 16px 6px 0;color:#64718a;vertical-align:top;">${label}</td><td style="padding:6px 0;">${value}</td></tr>` : "";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111c34;line-height:1.5;">
  <h2 style="margin:0 0 12px;font-size:18px;">New demo request from the Ship-Sphere website</h2>
  <table style="border-collapse:collapse;">
    ${row("Name", esc(name))}
    ${row("Email", `<a href="mailto:${esc(email)}">${esc(email)}</a>`)}
    ${row("Phone / WhatsApp", esc(phone))}
    ${row("Company", esc(company))}
    ${row("Message", esc(message).replace(/\n/g, "<br>"))}
  </table>
  <p style="margin-top:16px;color:#64718a;font-size:12px;">Reply to this email to answer ${esc(name)} directly.</p>
</div>`;

  const result = await sendEmail(supabase, {
    companyId: DEFAULT_COMPANY_ID,
    to: [DEMO_REQUEST_TO],
    subject: `Demo request: ${name}${company ? ` (${company})` : ""} <${email}>`,
    html,
    replyTo: email,
    emailType: EMAIL_TYPE,
    fromNameOverride: "Ship-Sphere Website",
  });
  if (!result.ok) {
    console.error("demo-request email failed:", result.error);
    return NextResponse.json({ error: "Sorry, we couldn't send your request right now. Please try again later." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
