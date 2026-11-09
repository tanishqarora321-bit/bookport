import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { fetchBookingsByStage, BookingStage } from "@/lib/bookings-data";
import SignInRequired from "@/components/SignInRequired";
import BookingsClient from "@/components/BookingsClient";

// The one server-side loader behind /bookings, /bookings/closed and
// /bookings/cancelled - same query, same grid, a different stage's rows.
export async function renderBookingsPage(stage: BookingStage) {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const companyId = me.company_id;

  const supabase = createServiceClient();

  const [stages, { data: forwarders }, { data: truckers }, { data: suppliers }, { data: buyers }] = await Promise.all([
    fetchBookingsByStage(supabase, companyId),
    // Forwarders/Truckers/Suppliers/Buyers are all `parties` rows,
    // filtered by role -- same table, same reasoning as every other
    // module that reuses it.
    supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["forwarder"]).order("legal_name"),
    supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["trucker"]).order("legal_name"),
    supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["supplier"]).order("legal_name"),
    supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["buyer"]).order("legal_name"),
  ]);

  if (stages.error) return <p className="text-red-600 p-6">{stages.error.message}</p>;

  const rows = stage === "open" ? stages.openRows : stage === "closed" ? stages.closedRows : stages.cancelledRows;

  return (
    <BookingsClient
      rows={rows}
      stage={stage}
      closedRows={stage === "open" ? stages.closedRows : []}
      forwarders={forwarders ?? []}
      truckers={truckers ?? []}
      suppliers={suppliers ?? []}
      buyers={buyers ?? []}
      isAdmin={me.role === "admin"}
    />
  );
}
