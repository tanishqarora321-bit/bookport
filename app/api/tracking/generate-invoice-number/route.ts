import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

// Pattern confirmed from the real NAM/Tracking sheets: YYYY-{party_short_code}/{seq}
// e.g. "2026-LR/09", next one is "2026-LR/10". Year = year of generation
// (not shipment date) - matches "the Year they issue" from the spec.
// Sequence resets per party per year, padded to at least 2 digits.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.party_id) {
    return NextResponse.json({ error: "party_id is required" }, { status: 400 });
  }

  const { data: party, error: partyError } = await supabase
    .from("parties")
    .select("short_code, legal_name")
    .eq("id", body.party_id)
    .single();

  if (partyError || !party) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }

  if (!party.short_code) {
    return NextResponse.json(
      { error: `"${party.legal_name}" has no short code set yet — add one under Buyers / Customers before generating an invoice number.` },
      { status: 400 }
    );
  }

  const year = new Date().getFullYear();
  const prefix = `${year}-${party.short_code}/`;

  const { data: existing, error: existingError } = await supabase
    .from("tracking")
    .select("invoice_no")
    .eq("company_id", DEFAULT_COMPANY_ID)
    .eq("party_id", body.party_id)
    .like("invoice_no", `${prefix}%`);

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  let maxSeq = 0;
  for (const row of existing ?? []) {
    const suffix = row.invoice_no?.slice(prefix.length);
    const n = parseInt(suffix ?? "", 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }

  const nextSeq = (maxSeq + 1).toString().padStart(2, "0");
  const invoice_no = `${prefix}${nextSeq}`;

  return NextResponse.json({ invoice_no });
}
