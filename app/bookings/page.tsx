import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { fetchBookingsSplitByDuplicates } from "@/lib/bookings-data";
import SignInRequired from "@/components/SignInRequired";
import BookingsClient from "@/components/BookingsClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function BookingsPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const companyId = me.company_id;

  const supabase = createServiceClient();

  const [{ error, singleRows, duplicateGroupCount }, { data: forwarders }, { data: truckers }, { data: suppliers }, { data: buyers }] =
    await Promise.all([
      fetchBookingsSplitByDuplicates(supabase, companyId),
      // Forwarders/Truckers/Suppliers/Buyers are all `parties` rows,
      // filtered by role -- same table, same reasoning as every other
      // module that reuses it.
      supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["forwarder"]).order("legal_name"),
      supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["trucker"]).order("legal_name"),
      supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["supplier"]).order("legal_name"),
      supabase.from("parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).contains("roles", ["buyer"]).order("legal_name"),
    ]);

  if (error) return <p className="text-red-600 p-6">{error.message}</p>;

  return (
    <BookingsClient
      rows={singleRows}
      forwarders={forwarders ?? []}
      truckers={truckers ?? []}
      suppliers={suppliers ?? []}
      buyers={buyers ?? []}
      duplicateGroupCount={duplicateGroupCount}
      isAdmin={me.role === "admin"}
    />
  );
}
