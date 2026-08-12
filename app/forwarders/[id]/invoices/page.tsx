import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import InvoiceLedgerClient from "@/components/InvoiceLedgerClient";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ForwarderInvoicesPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  const { data: forwarder, error: forwarderError } = await supabase
    .from("parties")
    .select("id, legal_name")
    .eq("id", params.id)
    .eq("company_id", DEFAULT_COMPANY_ID)
    .single();

  if (forwarderError || !forwarder) {
    return (
      <div className="p-6">
        <p className="text-red-600">Forwarder not found.</p>
        <Link href="/forwarders" className="text-accent text-sm">← Back to Forwarders</Link>
      </div>
    );
  }

  // Every invoice's eta/release_status is read live from `tracking` right
  // here, at render time -- never stored on forwarder_invoices itself.
  // This IS the "reflects automatically" behavior: there's no cached copy
  // to go stale, so every page load shows whatever tracking currently says.
  const { data: invoices, error: invoicesError } = await supabase
    .from("forwarder_invoices")
    .select(
      "id, booking_number, container_number, month_of_loading, shipping_line, consignee_name, pol, pod, invoice_number, invoice_date, invoice_due_date, freight_charges, bl_fees, aes_fees, extra_charges, correction_charges, demurrage, total, currency, paid_status, tracking_id, tracking:tracking_id (eta, release_status)"
    )
    .eq("company_id", DEFAULT_COMPANY_ID)
    .eq("forwarder_id", params.id)
    .order("month_of_loading", { ascending: false, nullsFirst: false });

  if (invoicesError) return <p className="text-red-600 p-6">{invoicesError.message}</p>;

  return <InvoiceLedgerClient forwarderId={params.id} forwarderName={forwarder.legal_name} initialInvoices={invoices ?? []} />;
}
