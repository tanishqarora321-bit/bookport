import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import TrackingClient, { type TrackingRow } from "@/components/TrackingClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Supabase caps one select at 1000 rows - read in pages so a big year
// never silently drops containers.
async function fetchAllPages<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return { data: out, error: null };
  }
}

// Shipment Tracking: one row per container. A row appears the moment a
// container number is added to a booking (sync_container_to_tracking), for
// every booking - open, closed or cancelled. Shipping Line, Forwarder,
// Trucker, Supplier and Buyer are read live from the booking; BL Number /
// Status from the booking's BL (Upload BL or manual entry in Booking &
// Instructions); Invoice Number from the Buyers / Consignee ledger.
export default async function TrackingPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const companyId = me.company_id;

  const supabase = createServiceClient();

  const [{ data: tracking, error: trackingError }, { data: buyerInvoices }] = await Promise.all([
    fetchAllPages<any>((from, to) =>
      supabase
        .from("tracking")
        .select(
          "id, booking_id, party_id, consignee_as_per_bl, invoice_no, booking_number, container_number, eta, release_status, shipping_line, invoice_sent, documents_sent, remarks, bl_number, last_tracking_check_at, created_at, forwarder:forwarder_id (legal_name), booking:booking_id (carrier, carrier_booking_no, bl_number, status, erd, cargo_cutoff, si_cutoff, booking_parties (role, parties (legal_name)))"
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllPages<{ tracking_id: string | null; invoice_number: string | null }>((from, to) =>
      supabase
        .from("buyer_invoices")
        .select("tracking_id, invoice_number")
        .eq("company_id", companyId)
        .not("tracking_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  if (trackingError) return <p className="text-red-600 p-6">{trackingError.message}</p>;

  const invoiceByTracking = new Map<string, string>();
  for (const bi of buyerInvoices ?? []) {
    if (bi.tracking_id && bi.invoice_number) invoiceByTracking.set(bi.tracking_id, bi.invoice_number);
  }

  const rows: TrackingRow[] = (tracking ?? []).map((t: any) => {
    const parties: { role: string; parties: { legal_name: string } | null }[] = t.booking?.booking_parties ?? [];
    const partyName = (role: string) => parties.find((p) => p.role === role)?.parties?.legal_name ?? null;
    const blNumber = t.booking?.bl_number || t.bl_number || null;
    return {
      id: t.id,
      booking_id: t.booking_id,
      booking_number: t.booking?.carrier_booking_no || t.booking_number,
      container_number: t.container_number,
      shipping_line: t.booking?.carrier || t.shipping_line,
      forwarder: partyName("forwarder") || t.forwarder?.legal_name || null,
      trucker: partyName("trucker"),
      supplier: partyName("supplier"),
      buyer: partyName("buyer") || t.consignee_as_per_bl || null,
      bl_number: blNumber,
      bl_status: blNumber ? "Y" : "N",
      invoice_no: invoiceByTracking.get(t.id) || t.invoice_no || null,
      invoice_sent: Boolean(t.invoice_sent),
      documents_sent: Boolean(t.documents_sent),
      eta: t.eta,
      release_status: t.release_status,
      last_tracking_check_at: t.last_tracking_check_at,
      remarks: t.remarks,
      booking_status: t.booking?.status ?? null,
      filing_date: t.booking?.erd || t.booking?.cargo_cutoff || t.booking?.si_cutoff || t.eta || null,
    };
  });

  return <TrackingClient initialTracking={rows} />;
}
