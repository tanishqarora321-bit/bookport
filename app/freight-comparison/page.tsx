import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import FreightComparisonClient from "@/components/FreightComparisonClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function FreightComparisonPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; destination?: string };
}) {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const companyId = me.company_id;

  const supabase = createServiceClient();

  // Every distinct (rate_month, destination) pair that has at least one
  // sheet -- powers the year/month/destination pickers. Supabase-js has no
  // DISTINCT, so this pulls the (small) header rows and dedupes in JS.
  const { data: allSheetsMeta, error: metaError } = await supabase
    .from("rate_sheets")
    .select("rate_month, destination")
    .eq("company_id", companyId)
    .order("rate_month", { ascending: false });

  if (metaError) return <p className="text-red-600 p-6">{metaError.message}</p>;

  const allMonths = (Array.from(new Set((allSheetsMeta ?? []).map((s: { rate_month: string }) => s.rate_month))) as string[]).sort().reverse();
  const yearOptions = Array.from(new Set(allMonths.map((m) => m.slice(0, 4)))).sort().reverse();
  const destinationOptions = Array.from(new Set((allSheetsMeta ?? []).map((s: { destination: string }) => s.destination))) as string[];

  // "all" shows the archive across every year (the pre-existing behavior);
  // any other value is a 4-digit year that narrows the month picker to
  // that year's rate sheets, which is the "yearly" half of the monthly/
  // yearly rate-sheet archive.
  const selectedYear: string = searchParams.year || yearOptions[0] || String(new Date().getFullYear());
  const monthOptions = selectedYear === "all" ? allMonths : allMonths.filter((m) => m.slice(0, 4) === selectedYear);

  const selectedMonth: string = searchParams.month || monthOptions[0] || new Date().toISOString().slice(0, 7) + "-01";
  const selectedDestination: string = searchParams.destination || destinationOptions[0] || "Mundra, IN";

  const { data: sheets, error: sheetsError } = await supabase
    .from("rate_sheets")
    .select(
      "id, forwarder_name, destination, rate_month, currency, source_type, source_file_name, notes, created_at, entries:rate_sheet_entries (id, origin, shipping_line, rate, free_days, sort_order)"
    )
    .eq("company_id", companyId)
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
      yearOptions={yearOptions}
      selectedYear={selectedYear}
      monthOptions={monthOptions}
      destinationOptions={destinationOptions}
      selectedMonth={selectedMonth}
      selectedDestination={selectedDestination}
      initialSheets={sorted}
    />
  );
}
