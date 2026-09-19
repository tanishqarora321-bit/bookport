import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

const ROLES = ["admin", "operations", "finance", "readonly"];

// Creates a teammate login under the current company, blocked once the
// company's seat_limit is reached. Uses inviteUserByEmail rather than
// admin.createUser with a generated password - Supabase emails the
// invitee a link where THEY set their own password, so there's never a
// password sitting in a request body, a log line, or a chat message.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = (body.email ?? "").trim().toLowerCase();
  const full_name = (body.full_name ?? "").trim();
  const role = ROLES.includes(body.role) ? body.role : "operations";

  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("seat_limit")
    .eq("id", DEFAULT_COMPANY_ID)
    .single();
  if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 });

  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", DEFAULT_COMPANY_ID)
    .eq("is_active", true);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  if ((count ?? 0) >= company.seat_limit) {
    return NextResponse.json(
      { error: `Seat limit reached (${count}/${company.seat_limit}). Remove a teammate or upgrade the plan before inviting another.` },
      { status: 400 }
    );
  }

  // Without an explicit redirectTo, Supabase sends the invite link back to
  // whatever "Site URL" is set in the dashboard's Auth settings - which
  // defaults to http://localhost:3000 and 404s for anyone who isn't
  // literally running the app on their own machine. req.nextUrl.origin is
  // whichever origin this request actually came from (the deployed URL in
  // production, localhost in local dev), so this is correct either way -
  // PROVIDED that origin is also added to the Redirect URLs allow-list in
  // Supabase's dashboard, which Supabase enforces regardless of what's
  // passed here.
  const redirectTo = `${req.nextUrl.origin}/auth/callback`;

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name },
    redirectTo,
  });

  if (inviteError) {
    // If this email already has a pending (unconfirmed) account from an
    // earlier attempt, the reliable fix is deleting it first: Supabase
    // Dashboard -> Authentication -> Users -> delete that row -> invite
    // again. A generateLink-based auto-retry was tried here and dropped -
    // it's not confirmed to actually trigger Supabase's email delivery in
    // this project's configuration, and produced a silent no-email failure
    // that was harder to diagnose than this plain error message is.
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: invited.user.id, full_name: full_name || null, role, company_id: DEFAULT_COMPANY_ID },
    { onConflict: "id" }
  );
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  return NextResponse.json({ ok: true, email, role });
}
