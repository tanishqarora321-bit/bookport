import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { PARTY_PAYMENT_DATE_KEYS, PARTY_PAYMENT_NUMERIC_KEYS } from "@/lib/party-payment-import-fields";
import { parseDateish } from "@/lib/parse-date";

export const maxDuration = 60;

function parseNumeric(v: string): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

type Skip = { row: number; reason: string };

// Bulk version of the single POST in app/api/party-payments/route.ts -
// applies the exact same validation and defaults (amount must be a
// positive number; currency defaults to USD; fx_rate to 1; date to
// today; applies_to_year from the date), just looped per sheet row and
// writing directly to party_payments instead of calling that endpoint
// over HTTP for each row.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const companyId = me.company_id;

  const body = await req.json();
  const partyId: string = body.partyId;
  const headers: string[] = body.headers ?? [];
  const rows: string[][] = body.rows ?? [];
  const mapping: Record<string, string | null> = body.mapping ?? {};

  if (!partyId) return NextResponse.json({ error: "partyId is required" }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }

  const colIndex: Record<string, number> = {};
  for (const [key, headerName] of Object.entries(mapping)) {
    if (!headerName) continue;
    const idx = headers.indexOf(headerName);
    if (idx !== -1) colIndex[key] = idx;
  }

  if (colIndex["amount"] === undefined) {
    return NextResponse.json({ error: "Amount must be mapped to a column before importing." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: party } = await supabase.from("parties").select("id").eq("id", partyId).eq("company_id", companyId).maybeSingle();
  if (!party) return NextResponse.json({ error: "Party not found" }, { status: 404 });

  const skipped: Skip[] = [];
  const toInsert: Record<string, any>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRow = i + 2;
    const get = (key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

    const amountRaw = get("amount");
    const amount = amountRaw ? parseNumeric(amountRaw) : null;
    if (!amount || amount <= 0) {
      skipped.push({ row: sheetRow, reason: "Amount must be a positive number" });
      continue;
    }

    const paidOnRaw = get("paid_on");
    const parsedDate = paidOnRaw ? parseDateish(paidOnRaw) : null;
    const paidOn = parsedDate ? parsedDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

    const appliesToYearRaw = get("applies_to_year");
    const appliesToYear = (appliesToYearRaw && parseNumeric(appliesToYearRaw)) || new Date(paidOn).getFullYear();

    const fxRateRaw = get("fx_rate");
    const fxRate = (fxRateRaw && parseNumeric(fxRateRaw)) || 1;

    toInsert.push({
      company_id: companyId,
      party_id: partyId,
      amount,
      currency: get("currency") || "USD",
      fx_rate: fxRate,
      paid_on: paidOn,
      applies_to_year: appliesToYear,
      note: get("note") || null,
      created_by: me.id,
    });
  }

  let imported = 0;
  if (toInsert.length > 0) {
    const { error, count } = await supabase.from("party_payments").insert(toInsert).select("id", { count: "exact" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    imported = count ?? toInsert.length;
  }

  return NextResponse.json({ imported, total: rows.length, skipped });
}
