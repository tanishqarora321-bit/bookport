import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import DocumentsClient from "@/components/DocumentsClient";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function TrackingDocumentsPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  const { data: tracking, error } = await supabase
    .from("tracking")
    .select(
      "id, booking_number, container_number, shipping_line, seal_number, invoice_no, party_id, item_id"
    )
    .eq("id", params.id)
    .eq("company_id", DEFAULT_COMPANY_ID)
    .single();

  if (error || !tracking) {
    return (
      <div className="p-6">
        <p className="text-red-600">Tracking entry not found.</p>
        <Link href="/tracking" className="text-accent text-sm">← Back to Tracking</Link>
      </div>
    );
  }

  const [{ data: party }, { data: item }, { data: existingDocs }] = await Promise.all([
    tracking.party_id ? supabase.from("parties").select("legal_name, address").eq("id", tracking.party_id).single() : Promise.resolve({ data: null }),
    tracking.item_id ? supabase.from("items").select("name").eq("id", tracking.item_id).single() : Promise.resolve({ data: null }),
    supabase
      .from("generated_documents")
      .select("id, doc_type, field_data, pdf_path, version, created_at")
      .eq("tracking_id", params.id)
      .order("version", { ascending: false }),
  ]);

  return (
    <DocumentsClient
      trackingId={params.id}
      tracking={tracking}
      partyName={party?.legal_name ?? null}
      partyAddress={party?.address ?? null}
      itemName={item?.name ?? null}
      existingDocs={existingDocs ?? []}
    />
  );
}
