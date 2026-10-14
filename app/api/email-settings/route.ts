import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// GET never returns the raw api_key - only whether one is configured -
// same reasoning as never round-tripping a password back to a form.
export async function GET() {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Only an admin can view email settings" }, { status: 403 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("company_email_settings")
    .select("provider, from_email, from_name, website, api_key")
    .eq("company_id", me.company_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    settings: data
      ? {
          provider: data.provider,
          from_email: data.from_email,
          from_name: data.from_name,
          website: data.website,
          configured: !!data.api_key,
        }
      : null,
  });
}

export async function PATCH(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Only an admin can edit email settings" }, { status: 403 });

  const body = await req.json();
  const fromEmail = (body.from_email ?? "").trim();
  const fromName = (body.from_name ?? "").trim();
  const website = (body.website ?? "").trim();
  const apiKey = (body.api_key ?? "").trim(); // blank means "leave the existing key as-is"

  if (!fromEmail) {
    return NextResponse.json({ error: "A From address is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("company_email_settings")
    .select("api_key")
    .eq("company_id", me.company_id)
    .maybeSingle();

  const { error } = await supabase.from("company_email_settings").upsert(
    {
      company_id: me.company_id,
      provider: "resend",
      from_email: fromEmail,
      from_name: fromName || null,
      website: website || null,
      api_key: apiKey || existing?.api_key || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
