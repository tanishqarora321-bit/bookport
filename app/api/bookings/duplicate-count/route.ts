import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { fetchBookingsSplitByDuplicates } from "@/lib/bookings-data";

// Powers the "Multiple Bookings" badge in the sidebar - how many distinct
// booking numbers currently have more than one entry, not how many rows.
export async function GET() {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ count: 0 });

  const supabase = createServiceClient();
  const { duplicateGroupCount } = await fetchBookingsSplitByDuplicates(supabase, me.company_id);
  return NextResponse.json({ count: duplicateGroupCount });
}
