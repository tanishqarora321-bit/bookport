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

  let userId: string;
  if (inviteError) {
    // Most likely cause: a previous invite to this same email already
    // created the auth user (e.g. the first attempt before redirectTo was
    // wired up here), and it's still sitting unconfirmed. Try to hand back
    // a fresh link for that same account rather than failing outright.
    // NOTE: unlike inviteUserByEmail, it's not fully confirmed here that
    // generateLink also triggers Supabase's own delivery in every project
    // configuration - if a teammate still doesn't get an email after this
    // succeeds, the reliable fallback is deleting the unconfirmed user from
    // Supabase Dashboard -> Authentication -> Users and inviting again.
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: { full_name } },
    });
    if (linkError) return NextResponse.json({ error: inviteError.message }, { status: 500 });
    userId = linkData.user.id;
  } else {
    userId = invited.user.id;
  }

  // Upsert, not insert: this must be safe to run twice for the same user
  // (e.g. the retry case right above) without failing on a duplicate key.
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: userId, full_name: full_name || null, role, company_id: DEFAULT_COMPANY_ID }, { onConflict: "id" });
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  return NextResponse.json({ ok: true, email, role });
}
