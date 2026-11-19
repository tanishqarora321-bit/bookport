import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { parseDateish, parseMonthish } from "@/lib/parse-date";
import { cleanCommissionFields } from "@/lib/commission-bookings";
import { normalizeContainerNo } from "@/lib/import-booking-fields";

export const maxDuration = 60;

type Skip = { row: number; reason: string };

// Bulk add of Commission Bookings from a mapped sheet. Same checks as the
// "New Commission Booking" form (lib/commission-bookings.ts). A row that's
// already there (same booking, container, amount and month) is skipped, so
// importing the same sheet twice doesn't double anything.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json();
  const headers: string[] = body.headers ?? [];
  const rows: string[][] = body.rows ?? [];
  const mapping: Record<string, string> = body.mapping ?? {};
  const defaultMonth = String(body.default_month ?? "").match(/^(\d{4})-(\d{2})/);
  if (!defaultMonth) return NextResponse.json({ error: "Choose the default Month of Loading" }, { status: 400 });
  if (!mapping.commission_amount) return NextResponse.json({ error: "Map Commission Amount to a column" }, { status: 400 });

  const col = (key: string) => (mapping[key] ? headers.indexOf(mapping[key]) : -1);
  const idx = Object.fromEntries(["booking_number", "container_number", "commission_party", "commission_amount", "month_of_loading"].map((k) => [k, col(k)]));
  const get = (r: string[], k: string) => (idx[k] >= 0 ? String(r[idx[k]] ?? "").trim() : "");
  const fallback = new Date(Date.UTC(Number(defaultMonth[1]), Number(defaultMonth[2]) - 1, 1));

  const supabase = createServiceClient();
  const existing = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("commission_bookings")
      .select("booking_number, container_number, commission_amount, month_of_loading")
      .eq("company_id", me.company_id)
      .order("id")
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const e of data ?? []) existing.add(dupKey(e.booking_number, e.container_number, Number(e.commission_amount), String(e.month_of_loading)));
    if (!data || data.length < 1000) break;
  }

  const skipped: Skip[] = [];
  const toInsert: Record<string, any>[] = [];
  rows.forEach((r, i) => {
    const sheetRow = i + 2;
    const rawMonth = get(r, "month_of_loading");
    let month = fallback;
    if (rawMonth) {
      const d = parseDateish(rawMonth) ?? parseMonthish(rawMonth, fallback);
      if (!d) {
        skipped.push({ row: sheetRow, reason: `Month of Loading "${rawMonth}" isn't a date` });
        return;
      }
      month = d;
    }
    const fields = cleanCommissionFields(
      {
        booking_number: get(r, "booking_number"),
        container_number: get(r, "container_number"),
        commission_party: get(r, "commission_party"),
        commission_amount: get(r, "commission_amount"),
        month_of_loading: month.toISOString().slice(0, 7),
      },
      true
    );
    if ("error" in fields) {
      skipped.push({ row: sheetRow, reason: fields.error });
      return;
    }
    const v = fields.values;
    const key = dupKey(v.booking_number, v.container_number, v.commission_amount, v.month_of_loading);
    if (existing.has(key)) {
      skipped.push({ row: sheetRow, reason: "Already in Commission Bookings" });
      return;
    }
    existing.add(key);
    toInsert.push({ company_id: me.company_id, ...v });
  });

  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await supabase.from("commission_bookings").insert(toInsert.slice(i, i + 500));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ imported: toInsert.length, total: rows.length, skipped });
}

function dupKey(booking: string | null, container: string | null, amount: number, month: string) {
  return [String(booking ?? "").trim().toUpperCase(), normalizeContainerNo(container), (Number(amount) || 0).toFixed(2), String(month).slice(0, 7)].join("|");
}
