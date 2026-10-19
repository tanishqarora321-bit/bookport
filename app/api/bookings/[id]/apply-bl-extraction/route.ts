import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// Saves the user-reviewed/corrected result of "Upload BL" (nothing from
// extract-bl is ever trusted until confirmed here). Two things happen:
// 1. The booking's own routing/BL fields get updated.
// 2. Each container line from the BL that matches one of this booking's
//    EXISTING containers (by container_no, case-insensitive) gets its
//    seal/weight/bales filled into container_packing_items - the same
//    table the Packing Details cell already reads/writes. A BL container
//    number that doesn't match any container already on this booking is
//    left alone and reported back, rather than silently creating a new
//    container under a guessed role/order.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .single();
  if (bookingError || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const bookingUpdates: Record<string, any> = {};
  const FIELD_MAP: Record<string, string> = {
    bl_number: "bl_number",
    bl_date: "bl_date",
    place_of_issue: "bl_issued_at",
    vessel: "vessel",
    voyage: "voyage",
    pol: "pol",
    pod: "pod",
    description_of_goods: "commodity",
    hs_code: "hs_code",
  };
  for (const [bodyKey, column] of Object.entries(FIELD_MAP)) {
    if (bodyKey in body) bookingUpdates[column] = body[bodyKey] || null;
  }

  if (Object.keys(bookingUpdates).length > 0) {
    const { error: updateError } = await supabase.from("bookings").update(bookingUpdates).eq("id", params.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const containers: { container_no?: string; seal_no?: string; gross_weight?: number; weight_unit?: string; bales?: number }[] =
    Array.isArray(body.containers) ? body.containers : [];

  let containersMatched = 0;
  const unmatchedContainers: string[] = [];

  if (containers.length > 0) {
    const { data: existingContainers } = await supabase
      .from("containers")
      .select("id, container_no")
      .eq("booking_id", params.id);

    const containerByNo = new Map<string, string>();
    for (const c of existingContainers ?? []) {
      if (c.container_no) containerByNo.set(c.container_no.trim().toLowerCase(), c.id);
    }

    for (const c of containers) {
      const containerNo = (c.container_no ?? "").trim();
      if (!containerNo) continue;
      const containerId = containerByNo.get(containerNo.toLowerCase());
      if (!containerId) {
        unmatchedContainers.push(containerNo);
        continue;
      }

      const { data: existingPacking } = await supabase
        .from("container_packing_items")
        .select("id")
        .eq("container_id", containerId)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      const packingFields: Record<string, any> = {};
      if (c.seal_no) packingFields.seal_no = c.seal_no;
      if (c.gross_weight != null) packingFields.weight = c.gross_weight;
      if (c.weight_unit) packingFields.weight_unit = /^kg/i.test(c.weight_unit) ? "KG" : "LBS";
      if (c.bales != null) packingFields.bales = c.bales;

      if (Object.keys(packingFields).length === 0) continue;

      if (existingPacking) {
        await supabase.from("container_packing_items").update(packingFields).eq("id", existingPacking.id);
      } else {
        await supabase.from("container_packing_items").insert({ container_id: containerId, sort_order: 0, ...packingFields });
      }
      containersMatched++;
    }
  }

  if (body.document_id) {
    await supabase.from("documents").update({ extraction_status: "reviewed" }).eq("id", body.document_id).eq("booking_id", params.id);
  }

  return NextResponse.json({ ok: true, containersMatched, unmatchedContainers });
}
