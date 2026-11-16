import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import DocumentsClient from "@/components/DocumentsClient";
import { buildFinalInvoiceDefaults } from "@/lib/final-invoice-defaults";
import { listItemsForBuyer } from "@/lib/buyer-items";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// The Final Invoice page - opened from the Buyers ledger's "Generate
// Invoice". Every field is pre-filled from the data the app already has
// (lib/final-invoice-defaults.ts: the buyer invoice, the booking, the BL
// and packing) and editable before printing.
export default async function TrackingDocumentsPage({ params, searchParams }: { params: { id: string }; searchParams?: { back?: string } }) {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;

  const supabase = createServiceClient();
  const defaults = await buildFinalInvoiceDefaults(supabase, params.id, me.company_id);

  if (!defaults) {
    return (
      <div className="p-6">
        <p className="text-red-600">Tracking entry not found.</p>
        <Link href="/tracking" className="text-accent text-sm">← Back to Tracking</Link>
      </div>
    );
  }

  // The goods-description dropdown: this buyer's Items first, then the rest.
  const itemLists = defaults.tracking.party_id
    ? await listItemsForBuyer(supabase, me.company_id, defaults.tracking.party_id)
    : { buyerItems: [], allItems: [], tableReady: false };

  // Supplier dropdown: every active supplier.
  const { data: suppliers } = await supabase
    .from("parties")
    .select("legal_name, is_active")
    .eq("company_id", me.company_id)
    .contains("roles", ["supplier"])
    .order("legal_name");

  const { data: existingDocs } = await supabase
    .from("generated_documents")
    .select("id, doc_type, field_data, pdf_path, version, created_at")
    .eq("tracking_id", params.id)
    .order("version", { ascending: false });

  // Only an in-app Buyers ledger path is accepted as the way back.
  const back = searchParams?.back && /^\/parties\/[\w-]+\/invoices$/.test(searchParams.back) ? searchParams.back : null;

  return (
    <DocumentsClient
      trackingId={params.id}
      defaults={defaults.data}
      hasBuyerInvoice={!!defaults.buyerInvoiceId}
      letterhead={defaults.templateConfig}
      buyerItems={itemLists.buyerItems.map((i) => i.name)}
      allItems={itemLists.allItems.map((i) => i.name)}
      suppliers={(suppliers ?? []).filter((x: any) => x.is_active !== false).map((x: any) => x.legal_name as string)}
      existingDocs={existingDocs ?? []}
      backHref={back ?? "/tracking"}
      backLabel={back ? "Back to Buyer ledger" : "Back to Shipment Tracking"}
    />
  );
}
