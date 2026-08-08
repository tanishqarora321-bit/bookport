import { createServiceClient } from "@/lib/supabase/server";
import BookingsClient from "@/components/BookingsClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TEMPORARY: service-role client, no login screen built yet - see README.
export default async function BookingsPage() {
  const supabase = createServiceClient();
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, booking_no, carrier_booking_no, erd, si_cutoff, cargo_cutoff, pol, pod, final_destination, bl_issued_at, carrier, forwarder_name, container_size, status")
    .order("created_at", { ascending: false });

  if (error) return <p className="text-red-600 p-6">{error.message}</p>;

  return <BookingsClient bookings={bookings ?? []} />;
}
