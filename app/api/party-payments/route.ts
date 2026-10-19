import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// Payment History per party (Forwarders/Suppliers/Truckers) - separate
// from the existing per-invoice PAID/UNPAID toggle, which stays exactly
// as it is. Always returns the party's FULL payment history regardless
// of any year filter the caller might apply client-side - the always-
// current "total paid" / "net still owed" balance is deliberately never
// year-scoped (see migration 0036's comment); only the Payment History
// list's own display groups by each entry's own applies_to_year.
export async function GET(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const partyId = req.nextUrl.searchParams.get("party_id");
  if (!partyId) return NextResponse.json({ error: "party_id is required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: party } = await supabase.from("parties").select("id").eq("id", partyId).eq("company_id", me.company_id).maybeSingle();
  if (!party) return NextResponse.json({ error: "Party not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("party_payments")
    .select("id, amount, currency, fx_rate, paid_on, applies_to_year, note, created_at")
    .eq("party_id", partyId)
    .order("paid_on", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ payments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  if (!body.party_id) return NextResponse.json({ error: "party_id is required" }, { status: 400 });
  const amount = Number(body.amount);
  if (!amount || amount <= 0) return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
  const paidOn = (body.paid_on || "").toString().trim() || new Date().toISOString().slice(0, 10);
  const appliesToYear = Number(body.applies_to_year) || new Date(paidOn).getFullYear();

  const supabase = createServiceClient();

  const { data: party } = await supabase.from("parties").select("id").eq("id", body.party_id).eq("company_id", me.company_id).maybeSingle();
  if (!party) return NextResponse.json({ error: "Party not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("party_payments")
    .insert({
      company_id: me.company_id,
      party_id: body.party_id,
      amount,
      currency: body.currency || "USD",
      fx_rate: Number(body.fx_rate) || 1,
      paid_on: paidOn,
      applies_to_year: appliesToYear,
      note: body.note || null,
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ payment: data });
}
