import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import BuyerInvoiceImportClient from "@/components/BuyerInvoiceImportClient";
import Link from "next/link";

export default async function ImportBuyerInvoicesPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const { data: buyer, error } = await supabase
    .from("parties")
    .select("id, legal_name")
    .eq("id", params.id)
    .eq("company_id", DEFAULT_COMPANY_ID)
    .single();

  if (error || !buyer) {
    return (
      <div className="p-6">
        <p className="text-red-600">Buyer not found.</p>
        <Link href="/parties" className="text-accent text-sm">← Back to Buyers / Customers</Link>
      </div>
    );
  }

  return <BuyerInvoiceImportClient buyerId={buyer.id} buyerName={buyer.legal_name} />;
}
