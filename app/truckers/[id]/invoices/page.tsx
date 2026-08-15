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

  const { data: invoices, error: invoicesError } = await supabase
    .from("trucker_invoices")
    .select(
      "id, booking_number, container_number, month_of_loading, location, invoice_number, invoice_date, invoice_due_date, amount, currency, charges_note, paid_status, tracking_id, tracking:tracking_id (eta, release_status)"
    )
    .eq("company_id", DEFAULT_COMPANY_ID)
    .eq("trucker_id", params.id)
    .order("month_of_loading", { ascending: false, nullsFirst: false });

  if (invoicesError) return <p className="text-red-600 p-6">{invoicesError.message}</p>;

  return <TruckerInvoiceLedgerClient truckerId={params.id} truckerName={trucker.legal_name} initialInvoices={invoices ?? []} />;
}
