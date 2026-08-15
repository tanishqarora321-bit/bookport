import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Adds one more description line under this booking's buyer/consignee --
// the "+" from Tanishq's screenshot. Kept as its own row (not a jsonb
// array on bookings) since these are meant to become invoice line items
// later, per his note -- a real table joins into that cleanly, an array
// column doesn't.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.description || !body.description.toString().trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("booking_consignee_items")
    .select("sort_order")
    .eq("booking_id", params.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("booking_consignee_items")
    .insert({
      booking_id: params.id,
      description: body.description.toString().trim(),
      sort_order: (existing?.sort_order ?? -1) + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
