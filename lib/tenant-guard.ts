import { NextResponse } from "next/server";

// Tenant isolation guard (security audit 2026-11). API routes use the
// service-role client, which bypasses Row Level Security, so any id that
// arrives in a request body (a tracking row, a party, an item...) must be
// confirmed to belong to the caller's company before it is stored or used.
// Otherwise one company could attach its records to - and read details
// through joins of - another company's rows.
//
// Usage:
//   const bad = await assertOwned(supabase, me.company_id, { tracking: body.tracking_id, parties: body.forwarder_id });
//   if (bad) return bad;
// Blank / null ids are skipped (they mean "not linked").
export async function assertOwned(
  supabase: any,
  companyId: string,
  refs: Partial<Record<"tracking" | "parties" | "items" | "bookings", unknown>>
): Promise<NextResponse | null> {
  for (const [table, raw] of Object.entries(refs)) {
    if (raw === null || raw === undefined || raw === "") continue;
    const id = String(raw);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
    const { data } = await supabase.from(table).select("id").eq("id", id).eq("company_id", companyId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Linked record not found" }, { status: 404 });
  }
  return null;
}
