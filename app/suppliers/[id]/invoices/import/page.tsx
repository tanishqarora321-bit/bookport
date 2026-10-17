import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import SupplierInvoiceImportClient from "@/components/SupplierInvoiceImportClient";
import Link from "next/link";

export default async function ImportSupplierInvoicesPage({ params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const companyId = me.company_id;

  const supabase = createServiceClient();
  const { data: supplier, error } = await supabase
    .from("parties")
    .select("id, legal_name")
    .eq("id", params.id)
    .eq("company_id", companyId)
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
