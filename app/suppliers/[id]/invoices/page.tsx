import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import SupplierInvoiceLedgerClient from "@/components/SupplierInvoiceLedgerClient";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SupplierInvoicesPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  const { data: supplier, error: supplierError } = await supabase
    .from("parties")
    .select("id, legal_name")
    .eq("id", params.id)
    .eq("company_id", DEFAULT_COMPANY_ID)
    .single();

  if (supplierError || !supplier) {
    return (
      <div className="p-6">
        <p className="text-red-600">Supplier not found.</p>
        <Link href="/suppliers" className="text-accent text-sm">← Back to Suppliers</Link>
      </div>
    );
  }

  // Every invoice's eta/release_status is read live from `tracking` right
  // here, at render time -- never stored on supplier_invoices itself, same
  // "reflects automatically" pattern as Forwarder/Trucker invoices.
  const { data: invoices, error: invoicesError } = await supabase
    .from("supplier_invoices")
    .select(
      "id, booking_number, container_number, month_of_loading, forwarder_name, consignee_name, invoice_number, invoice_date, total, currency, paid_status, notes, tracking_id, tracking:tracking_id (eta, release_status), items:supplier_invoice_items (id, description, weight_kg, unit_price, amount, sort_order)"
    )
    .eq("company_id", DEFAULT_COMPANY_ID)
    .eq("supplier_id", params.id)
    .order("invoice_date", { ascending: false, nullsFirst: false });

  if (invoicesError) return <p className="text-red-600 p-6">{invoicesError.message}</p>;

  const sorted = (invoices ?? []).map((inv: any) => ({
    ...inv,
    items: (inv.items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }));

  return (
    <SupplierInvoiceLedgerClient
      supplierId={params.id}
      supplierName={supplier.legal_name}
      initialInvoices={sorted}
    />
  );
}
