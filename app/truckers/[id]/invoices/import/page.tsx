import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import TruckerInvoiceImportClient from "@/components/TruckerInvoiceImportClient";
import Link from "next/link";

export default async function ImportTruckerInvoicesPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const { data: trucker, error } = await supabase
    .from("parties")
    .select("id, legal_name")
    .eq("id", params.id)
    .eq("company_id", DEFAULT_COMPANY_ID)
    .single();

  if (error || !trucker) {
    return (
      <div className="p-6">
        <p className="text-red-600">Trucker not found.</p>
        <Link href="/truckers" className="text-accent text-sm">← Back to Truckers</Link>
      </div>
    );
  }

  return <TruckerInvoiceImportClient truckerId={trucker.id} truckerName={trucker.legal_name} />;
}
