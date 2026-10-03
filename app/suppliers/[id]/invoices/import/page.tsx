import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import SupplierInvoiceImportClient from "@/components/SupplierInvoiceImportClient";
import Link from "next/link";

export default async function ImportSupplierInvoicesPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const { data: supplier, error } = await supabase
    .from("parties")
    .select("id, legal_name")
    .eq("id", params.id)
    .eq("company_id", DEFAULT_COMPANY_ID)
    .single();

  if (error || !supplier) {
    return (
      <div className="p-6">
        <p className="text-red-600">Supplier not found.</p>
        <Link href="/suppliers" className="text-accent text-sm">← Back to Suppliers</Link>
      </div>
    );
  }

  return <SupplierInvoiceImportClient supplierId={supplier.id} supplierName={supplier.legal_name} />;
}
