import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import CommissionBookingsClient from "@/components/CommissionBookingsClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Operations > Commission Bookings (owner, 2026-11): bookings the company
// earns a commission on, entered by hand. Their amounts feed the P&L.
export default async function CommissionBookingsPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const supabase = createServiceClient();

  const rows: any[] = [];
  let ready = true;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("commission_bookings")
      .select("id, booking_number, container_number, commission_party, commission_amount, month_of_loading, created_at")
      .eq("company_id", me.company_id)
      .order("month_of_loading", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) {
      ready = false; // migration 0040 not run yet
      break;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // Suggestions for the Commission Party box: every party's name.
  const { data: parties } = await supabase.from("parties").select("legal_name").eq("company_id", me.company_id).order("legal_name");

  return (
    <CommissionBookingsClient
      initialRows={rows}
      ready={ready}
      partyNames={Array.from(new Set((parties ?? []).map((p: any) => p.legal_name as string)))}
    />
  );
}
