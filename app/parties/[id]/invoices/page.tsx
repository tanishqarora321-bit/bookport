import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import BuyerInvoiceLedgerClient from "@/components/BuyerInvoiceLedgerClient";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function BuyerInvoicesPage({ params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const companyId = me.company_id;

  const supabase = createServiceClient();

  const { data: buyer, error: buyerError } = await supabase
    .from("parties")
    .select("id, legal_name")
    .eq("id", params.id)
    .eq("company_id", companyId)
    .single();

  if (buyerError || !buyer) {
    return (
      <div className="p-6">
        <p className="text-red-600">Buyer not found.</p>
        <Link href="/parties" className="text-accent text-sm">← Back to Buyers / Customers</Link>
      </div>
    );
  }

  // Every invoice's eta/release_status is read live from `tracking` right
  // here, at render time -- never stored on buyer_invoices itself, same
  // "reflects automatically" pattern as Forwarder/Supplier/Trucker invoices.
  const { data: invoices, error: invoicesError } = await supabase
    .from("buyer_invoices")
    .select(
      "id, booking_number, container_number, location, month_of_loading, bl_date, due_date, forwarder_name, invoice_number, invoice_date, weight, weight_unit, total, total_usd, currency, fx_rate, paid_status, notes, tracking_id, tracking:tracking_id (eta, release_status), items:buyer_invoice_items (id, description, weight_kg, unit_price, amount, sort_order)"
    )
    .eq("company_id", companyId)
    .eq("buyer_id", params.id)
    .order("invoice_date", { ascending: false, nullsFirst: false });

  if (invoicesError) return <p className="text-red-600 p-6">{invoicesError.message}</p>;

  const sorted = (invoices ?? []).map((inv: any) => ({
    ...inv,
    items: (inv.items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }));

  return (
    <BuyerInvoiceLedgerClient
      buyerId={params.id}
      buyerName={buyer.legal_name}
      initialInvoices={sorted}
    />
  );
}
