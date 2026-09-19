import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import FreightComparisonClient from "@/components/FreightComparisonClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TEMPORARY: service-role client, no login screen built yet - see README.
export default async function FreightComparisonPage({
  searchParams,
}: {
  searchParams: { month?: string; destination?: string };
}) {
  const supabase = createServiceClient();

  // Every distinct (rate_month, destination) pair that has at least one
  // sheet -- powers the month/destination pickers. Supabase-js has no
  // DISTINCT, so this pulls the (small) header rows and dedupes in JS.
  const { data: allSheetsMeta, error: metaError } = await supabase
    .from("rate_sheets")
    .select("rate_month, destination")
    .eq("company_id", DEFAULT_COMPANY_ID)
    .order("rate_month", { ascending: false });

  if (metaError) return <p className="text-red-600 p-6">{metaError.message}</p>;

  const monthOptions = (Array.from(new Set((allSheetsMeta ?? []).map((s: { rate_month: string }) => s.rate_month))) as string[]).sort().reverse();
  const destinationOptions = Array.from(new Set((allSheetsMeta ?? []).map((s: { destination: string }) => s.destination))) as string[];

  const selectedMonth: string = searchParams.month || monthOptions[0] || new Date().toISOString().slice(0, 7) + "-01";
  const selectedDestination: string = searchParams.destination || destinationOptions[0] || "Mundra, IN";

  const { data: sheets, error: sheetsError } = await supabase
    .from("rate_sheets")
    .select(
      "id, forwarder_name, destination, rate_month, currency, source_type, source_file_name, notes, created_at, entries:rate_sheet_entries (id, origin, shipping_line, rate, free_days, sort_order)"
    )
    .eq("company_id", DEFAULT_COMPANY_ID)
    .eq("rate_month", selectedMonth)
    .eq("destination", selectedDestination)
    .order("created_at", { ascending: true });

  if (sheetsError) return <p className="text-red-600 p-6">{sheetsError.message}</p>;

  const sorted = (sheets ?? []).map((s: any) => ({
    ...s,
    entries: (s.entries ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }));

  return (
    <FreightComparisonClient
      monthOptions={monthOptions}
      destinationOptions={destinationOptions}
      selectedMonth={selectedMonth}
      selectedDestination={selectedDestination}
      initialSheets={sorted}
    />
  );
}
