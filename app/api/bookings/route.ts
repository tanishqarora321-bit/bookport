import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

// Was count(rows matching BP-YY-%) + 1 - correct only as long as no
// booking is ever deleted. Deleting one (e.g. the Delete button added
// to the grid, or clearing a duplicate) leaves a gap, so the next
// count-based number collides with an EXISTING row's booking_no and
// the next manual/PDF/import booking creation fails outright with a
// raw 500. Confirmed live via a QA test run. Uses the actual highest
// existing sequence number instead, which survives gaps; the POST
// handler below also retries on a 23505 for this column specifically,
// covering the rarer case of two inserts racing each other.
async function nextBookingNo(supabase: any): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const { data } = await supabase
    .from("bookings")
    .select("booking_no")
    .like("booking_no", `BP-${year}-%`)
    .order("booking_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastSeq = data?.booking_no ? parseInt(data.booking_no.split("-")[2], 10) || 0 : 0;
  return `BP-${year}-${String(lastSeq + 1).padStart(4, "0")}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Pull out anything that isn't a real bookings column BEFORE inserting -
  // this is what caused "Could not find the 'source_document_id' column"
  // and would have hit the same wall on '_source_document_id' too.
  const { _source_document_id, source_document_id, ...rawFields } = body;
  const linkedDocumentId = _source_document_id ?? source_document_id ?? null;

  // Empty text from a blank form field ("") is not the same thing as SQL
  // NULL - a timestamptz column rejects "" outright. This is what threw
  // "invalid input syntax for type timestamp with time zone" on any booking
  // where ERD/cutoffs were correctly left blank by the extractor.
  const bookingFields = Object.fromEntries(
    Object.entries(rawFields).map(([k, v]) => [k, v === "" ? null : v])
  );

  const supabase = createServiceClient();

  let data: any = null;
  let lastError: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const booking_no = await nextBookingNo(supabase);
    const { data: inserted, error } = await supabase
      .from("bookings")
      .insert({ ...bookingFields, booking_no, company_id: DEFAULT_COMPANY_ID })
      .select()
      .single();

    if (!error) {
      data = inserted;
      break;
    }

    if (error.code === "23505" && error.message.includes("carrier_booking_no")) {
      return NextResponse.json(
        { error: `Booking Number "${bookingFields.carrier_booking_no}" already exists.` },
        { status: 409 }
      );
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
