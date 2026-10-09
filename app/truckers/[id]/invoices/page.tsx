import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import TruckerInvoiceLedgerClient from "@/components/TruckerInvoiceLedgerClient";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function TruckerInvoicesPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  const { data: trucker, error: truckerError } = await supabase
    .from("parties")
    .select("id, legal_name")
    .eq("id", params.id)
    .eq("company_id", DEFAULT_COMPANY_ID)
    .single();

  if (truckerError || !trucker) {
    return (
      <div className="p-6">
        <p className="text-red-600">Trucker not found.</p>
        <Link href="/truckers" className="text-accent text-sm">← Back to Truckers</Link>
      </div>
    );
  }

  // Every invoice's eta/release_status is read live from `tracking` right
  // here, at render time -- never stored on trucker_invoices itself, same
  // "reflects automatically" pattern as Forwarder/Supplier invoices.
  const [{ data: invoices, error: invoicesError }, { data: customColumns }] = await Promise.all([
    supabase
      .from("trucker_invoices")
      .select(
        "id, booking_number, container_number, month_of_loading, location, invoice_number, invoice_date, invoice_due_date, trucking, fuel_surcharge, chassis_rental, stop_off, chassis_split, misc_charges, custom_charges, total, currency, fx_rate, total_usd, paid_status, tracking_id, tracking:tracking_id (eta, release_status)"
      )
      .eq("company_id", DEFAULT_COMPANY_ID)
      .eq("trucker_id", params.id)
      .order("month_of_loading", { ascending: false, nullsFirst: false }),
    // Shared across every trucker's ledger, not just this one - see
    // supabase/migrations/0022_trucker_invoice_charges.sql.
    supabase
      .from("trucker_invoice_custom_columns")
      .select("id, key, label")
      .eq("company_id", DEFAULT_COMPANY_ID)
      .order("created_at"),
  ]);

  if (invoicesError) return <p className="text-red-600 p-6">{invoicesError.message}</p>;

  return (
    <TruckerInvoiceLedgerClient
      truckerId={params.id}
      truckerName={trucker.legal_name}
      initialInvoices={invoices ?? []}
      initialCustomColumns={customColumns ?? []}
    />
  );
}
