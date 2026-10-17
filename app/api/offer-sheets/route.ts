import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// Creates a new offer sheet under an existing section (offer_sheet_type).
//
// NOTE: this file previously contained the "add one row" logic that
// belongs in app/api/offer-sheets/[id]/rows/route.ts (a copy/paste mistake
// from the original "Add Freight Comparison/Offer Sheet" commit - both
// files had identical content, and POST /api/offer-sheets, the endpoint
// NewSheetPanel in OfferSheetsListClient.tsx actually calls to create a
// sheet, never worked). Restored to match its route and the client's
// actual request shape ({ offer_sheet_type_id, title, period }) while
// adding the auth/company-scoping this security pass is for.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const { offer_sheet_type_id, title, period } = body;

  if (!offer_sheet_type_id) {
    return NextResponse.json({ error: "offer_sheet_type_id is required" }, { status: 400 });
  }
  if (!title || !title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // The type id comes from the client - confirm it's actually one of this
  // company's sections before using it, so a guessed/leaked id from
  // another company can't be used to create a sheet under their section.
  const { data: type, error: typeError } = await supabase
    .from("offer_sheet_types")
    .select("id")
    .eq("id", offer_sheet_type_id)
    .eq("company_id", me.company_id)
    .single();
  if (typeError || !type) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("offer_sheets")
    .insert({
      company_id: me.company_id,
      offer_sheet_type_id,
      title: title.trim(),
      period: period || null,
      settings: {},
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offer_sheet: data });
}
