import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { nextInvoiceNumber } from "@/lib/invoice-number";

// Pattern confirmed from the real NAM/Tracking sheets: YYYY-{party_short_code}/{seq}
// e.g. "2026-LR/09", next one is "2026-LR/10". Year = year of generation
// (not shipment date) - matches "the Year they issue" from the spec.
// Sequence resets per party per year, padded to at least 2 digits.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.party_id) {
    return NextResponse.json({ error: "party_id is required" }, { status: 400 });
  }

  const result = await nextInvoiceNumber(supabase, me.company_id, body.party_id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ invoice_no: result.invoice_no });
}
