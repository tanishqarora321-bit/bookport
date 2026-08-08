import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

async function nextBookingNo(supabase: any) {
  const year = new Date().getFullYear().toString().slice(-2);
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .like("booking_no", `BP-${year}-%`);
  const seq = String((count ?? 0) + 1).padStart(4, "0");
  return `BP-${year}-${seq}`;
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
  const booking_no = await nextBookingNo(supabase);

  const { data, error } = await supabase
    .from("bookings")
    .insert({ ...bookingFields, booking_no })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (linkedDocumentId) {
    await supabase
      .from("documents")
      .update({ booking_id: data.id, extraction_status: "reviewed" })
      .eq("id", linkedDocumentId);
  }

  return NextResponse.json({ booking: data });
}
