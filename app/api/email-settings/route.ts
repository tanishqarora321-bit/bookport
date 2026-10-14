import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// Sending itself runs on one platform-wide Resend account (see
// lib/send-email.ts) - this is purely optional per-company
// personalization (display name/reply-to/website), not a setup gate.
export async function GET() {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Only an admin can view email settings" }, { status: 403 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("company_email_settings")
    .select("from_name, reply_to, website")
    .eq("company_id", me.company_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}

export async function PATCH(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Only an admin can edit email settings" }, { status: 403 });

  const body = await req.json();
  const fromName = (body.from_name ?? "").trim();
  const replyTo = (body.reply_to ?? "").trim();
  const website = (body.website ?? "").trim();

  const supabase = createServiceClient();

  const { error } = await supabase.from("company_email_settings").upsert(
    {
      company_id: me.company_id,
      from_name: fromName || null,
      reply_to: replyTo || null,
      website: website || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
