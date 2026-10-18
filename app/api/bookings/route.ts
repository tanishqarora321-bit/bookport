import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { nextBookingNo } from "@/lib/booking-number";

export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();

  // Pull out anything that isn't a real bookings column BEFORE inserting -
  // this is what caused "Could not find the 'source_document_id' column"
  // and would have hit the same wall on '_source_document_id' too.
  const { _source_document_id, source_document_id, force, requireDuplicateOf, ...rawFields } = body;
  const linkedDocumentId = _source_document_id ?? source_document_id ?? null;

  // Empty text from a blank form field ("") is not the same thing as SQL
  // NULL - a timestamptz column rejects "" outright. This is what threw
  // "invalid input syntax for type timestamp with time zone" on any booking
  // where ERD/cutoffs were correctly left blank by the extractor.
  const bookingFields = Object.fromEntries(
    Object.entries(rawFields).map(([k, v]) => [k, v === "" ? null : v])
  );

  const supabase = createServiceClient();

  // carrier_booking_no no longer has a hard unique constraint (migration
  // 0031) - the same number legitimately gets reused sometimes (a carrier
  // reissues/amends a booking under the same reference, a booking gets
  // split, etc.), and a second real entry needs somewhere to go instead
  // of being blocked outright. A booking number used more than once shows
  // on the separate Multiple Bookings & Instructions page instead (see
  // lib/bookings-data.ts) - so creating one here is allowed, just gated
  // behind an explicit confirmation from the user first.
  const carrierBookingNo = (bookingFields.carrier_booking_no ?? "").toString().trim();
  let existingMatch: { id: string; status: string; created_at: string } | null = null;
  if (carrierBookingNo) {
    // Escape LIKE/ILIKE special characters so a booking number containing
    // a literal % or _ can't accidentally match something it shouldn't.
    const escaped = carrierBookingNo.replace(/[%_\\]/g, (c) => `\\${c}`);
    const { data: match } = await supabase
      .from("bookings")
      .select("id, status, created_at")
      .eq("company_id", me.company_id)
      .ilike("carrier_booking_no", escaped)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existingMatch = match ?? null;
  }

  // The Multiple Bookings page's own "+ New Booking" link only makes
  // sense for a number that's already in use elsewhere - a brand new
  // number belongs on the normal Booking & Instructions page, not here.
  if (requireDuplicateOf && !existingMatch) {
    return NextResponse.json(
      { error: `Booking Number "${carrierBookingNo}" doesn't exist yet in Booking & Instructions - create it there first, not from Multiple Bookings.` },
      { status: 400 }
    );
  }

  if (existingMatch && !force && !requireDuplicateOf) {
    return NextResponse.json(
      {
        error: `Booking Number "${carrierBookingNo}" already exists.`,
        duplicate: true,
        existing: existingMatch,
      },
      { status: 409 }
    );
  }

  let data: any = null;
  let lastError: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const booking_no = await nextBookingNo(supabase, me.company_id);
    const { data: inserted, error } = await supabase
      .from("bookings")
      .insert({ ...bookingFields, booking_no, company_id: me.company_id })
      .select()
      .single();

    if (!error) {
      data = inserted;
      break;
    }

    if (error.code === "23505" && error.message.includes("booking_no")) {
      // Two inserts raced for the same generated booking_no - retry
      // with a freshly recomputed one rather than failing outright.
      lastError = error;
      continue;
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: lastError?.message || "Could not generate a unique booking number - try again" }, { status: 500 });
  }

  if (linkedDocumentId) {
    await supabase
      .from("documents")
      .update({ booking_id: data.id, extraction_status: "reviewed" })
      .eq("id", linkedDocumentId);
  }

  return NextResponse.json({ booking: data });
}
