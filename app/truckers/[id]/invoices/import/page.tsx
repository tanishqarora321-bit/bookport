import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import TruckerInvoiceImportClient from "@/components/TruckerInvoiceImportClient";
import Link from "next/link";

export default async function ImportTruckerInvoicesPage({ params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;

  const supabase = createServiceClient();
  const { data: trucker, error } = await supabase
    .from("parties")
    .select("id, legal_name")
    .eq("id", params.id)
    .eq("company_id", me.company_id)
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
