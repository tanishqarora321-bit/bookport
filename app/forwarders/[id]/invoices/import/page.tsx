import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import ForwarderInvoiceImportClient from "@/components/ForwarderInvoiceImportClient";
import Link from "next/link";

export default async function ImportForwarderInvoicesPage({ params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired message="Importing forwarder invoices" />;
  const companyId = me.company_id;

  const supabase = createServiceClient();
  const { data: forwarder, error } = await supabase
    .from("parties")
    .select("id, legal_name")
    .eq("id", params.id)
    .eq("company_id", companyId)
    .single();

  if (error || !forwarder) {
    return (
      <div className="p-6">
        <p className="text-red-600">Forwarder not found.</p>
        <Link href="/forwarders" className="text-accent text-sm">← Back to Forwarders</Link>
      </div>
    );
  }

  return <ForwarderInvoiceImportClient forwarderId={forwarder.id} forwarderName={forwarder.legal_name} />;
}
