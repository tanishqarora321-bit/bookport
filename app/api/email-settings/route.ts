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
    .select("website")
    .eq("company_id", me.company_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}

// from_name/reply_to used to live here too, as one shared row per company -
// dropped because every sender (Send Instructions, Team Invite) now derives
// its own name/reply-to from whoever is actually logged in and sending
// (getCurrentProfile()), which is the only correct behavior once a company
// has more than one teammate sending mail. Website is genuinely
// company-wide, so it stays.
export async function PATCH(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Only an admin can edit email settings" }, { status: 403 });

  const body = await req.json();
  const website = (body.website ?? "").trim();

  const supabase = createServiceClient();

  const { error } = await supabase.from("company_email_settings").upsert(
    {
      company_id: me.company_id,
      website: website || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
