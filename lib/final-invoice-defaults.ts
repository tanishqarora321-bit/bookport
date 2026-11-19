import type { InvoiceFieldData, InvoiceLineItem, TemplateConfig } from "@/lib/pdf/generateFinalInvoice";
import { getTrackingDocContext } from "@/lib/tracking-doc-context";
import { splitBuyerItems } from "@/lib/buyer-charges";

// Everything the Final Invoice is pre-filled with, from the data the app
// already has - used by the Final Invoice page (to show it, editable) and
// by the PDF route (as the defaults under whatever was edited):
//   - the Buyers ledger row: invoice no./date, weight, goods lines (Cost
//     section: weight x rate) and Ocean Freight / Commission / Trucking;
//   - the booking (Booking & Instructions): Ship Via = its Shipping Line,
//     Supplier (printed under the lines), goods description;
//   - the container's packing: bales, seal, weight;
//   - the buyer's shipping details: consignee name + address.
export type FinalInvoiceDefaults = {
  tracking: { id: string; booking_number: string | null; container_number: string | null; invoice_no: string | null; party_id: string | null };
  buyerInvoiceId: string | null;
  templateConfig: TemplateConfig | null;
  data: InvoiceFieldData;
};

export async function buildFinalInvoiceDefaults(supabase: any, trackingId: string, companyId: string): Promise<FinalInvoiceDefaults | null> {
  const { data: tracking } = await supabase
    .from("tracking")
    .select("id, booking_id, booking_number, container_number, shipping_line, seal_number, party_id, item_id, invoice_no")
    .eq("id", trackingId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!tracking) return null;

  const [ctx, { data: party }, { data: item }, { data: templateRow }, { data: buyerInvoice }, { data: booking }, { data: supplierRow }] = await Promise.all([
    getTrackingDocContext(supabase, trackingId, companyId),
    tracking.party_id ? supabase.from("parties").select("legal_name, address").eq("id", tracking.party_id).maybeSingle() : Promise.resolve({ data: null }),
    tracking.item_id ? supabase.from("items").select("name").eq("id", tracking.item_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase
      .from("document_templates")
      .select("template_config")
      .eq("company_id", companyId)
      .eq("doc_type", "final_invoice")
      .eq("is_default", true)
      .maybeSingle(),
    supabase
      .from("buyer_invoices")
      .select("id, invoice_number, invoice_date, weight, weight_unit, total, currency, items:buyer_invoice_items (description, weight_kg, unit_price, amount, sort_order)")
      .eq("tracking_id", trackingId)
      .maybeSingle(),
    tracking.booking_id ? supabase.from("bookings").select("carrier").eq("id", tracking.booking_id).maybeSingle() : Promise.resolve({ data: null }),
    tracking.booking_id
      ? supabase.from("booking_parties").select("role, parties (legal_name)").eq("booking_id", tracking.booking_id)
      : Promise.resolve({ data: null }),
  ]);
  // Supplier = the booking's Supplier on Booking & Instructions; failing
  // that, the supplier invoice on this container.
  let supplierName =
    ((supplierRow as any[] | null) ?? []).find((r) => String(r.role).toLowerCase() === "supplier" && r.parties?.legal_name)?.parties?.legal_name ?? "";
  if (!supplierName) {
    const { data: si } = await supabase.from("supplier_invoices").select("supplier:supplier_id (legal_name)").eq("tracking_id", trackingId).limit(1).maybeSingle();
    supplierName = (si as any)?.supplier?.legal_name ?? "";
  }

  const packing = ctx?.packingItem ?? null;
  const allItems: InvoiceLineItem[] = ((buyerInvoice as any)?.items ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((it: any): InvoiceLineItem => ({ description: it.description, weight_kg: it.weight_kg, unit_price: it.unit_price, amount: Number(it.amount) || 0 }));
  const { goods, charges } = splitBuyerItems(allItems);
  const useInvoiceWeight = buyerInvoice?.weight != null;
  const weight = useInvoiceWeight ? buyerInvoice!.weight : packing?.weight ?? null;
  const weightUnit = useInvoiceWeight ? buyerInvoice!.weight_unit : packing?.weight_unit;
  const config = (templateRow?.template_config ?? null) as (TemplateConfig & { signed_by?: string }) | null;

  const data: InvoiceFieldData = {
    invoice_no: buyerInvoice?.invoice_number || tracking.invoice_no || "",
    invoice_date: buyerInvoice?.invoice_date || new Date().toISOString().slice(0, 10),
    consignee_name: party?.legal_name || "",
    consignee_address: ctx?.gstEntry?.address || party?.address || "",
    booking_number: tracking.booking_number || "",
    container_number: tracking.container_number || "",
    seal_number: tracking.seal_number || packing?.seal_no || "",
    // Ship Via = the Shipping Line on Booking & Instructions when it has one.
    ship_via: (booking as any)?.carrier || tracking.shipping_line || "",
    terms: "Advance",
    reference_no: "",
    weight_lbs: weight != null ? String(weight) : "",
    weight_unit: /^KG/i.test(weightUnit || "") ? "KG" : "LBS",
    qty_bales: packing?.bales != null ? String(packing.bales) : "",
    description: item?.name || "",
    // The heading line: the buyer's own "Description of Goods" (Shipping
    // Details) when filled, else the booking's commodity, else the item.
    goods_description: ctx?.gstEntry?.description_of_goods || ctx?.booking?.commodity || "",
    supplier_name: supplierName,
    rate: "",
    amount: "",
    currency: buyerInvoice?.currency || "USD",
    // "By: NITIN SINGLA" - Settings > letterhead, never whoever is logged in.
    signed_by: config?.signed_by || "NITIN SINGLA",
    items: goods,
    charges,
  };

  return {
    tracking: { id: tracking.id, booking_number: tracking.booking_number, container_number: tracking.container_number, invoice_no: tracking.invoice_no, party_id: tracking.party_id },
    buyerInvoiceId: (buyerInvoice as any)?.id ?? null,
    templateConfig: config,
    data,
  };
}
