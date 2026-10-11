import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import {
  generateBookingInstructionsPdf,
  InstructionFieldData,
  InstructionTemplateConfig,
} from "@/lib/pdf/generateBookingInstructions";

// "Generate Instructions" button (components/GenerateInstructionsCell.tsx)
// - renders straight from the booking/container/GST-entry data already on
// the grid, same generate-then-upload-then-sign-url shape as
// app/api/tracking/[id]/documents/route.ts, but anchored to booking_id
// instead of tracking_id since there's no tracking row involved here
// (see migration 0023's generated_documents.booking_id column).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const supabase = createServiceClient();

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, carrier_booking_no, final_destination, commodity, hs_code, gross_weight, consignee_gst_entry_id, booking_parties (role, party_id, parties (legal_name, address))"
    )
    .eq("id", params.id)
    .single();

  if (bookingError || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const containerId: string | null = body.container_id ?? null;
  const [{ data: container }, { data: gstEntry }, { data: templateRow }] = await Promise.all([
    containerId
      ? supabase
          .from("containers")
          .select("container_no, seal_no, packing_items:container_packing_items (seal_no, weight, weight_unit, bales, sort_order)")
          .eq("id", containerId)
          .single()
      : Promise.resolve({ data: null }),
    booking.consignee_gst_entry_id
      ? supabase
          .from("buyer_gst_entries")
          .select("legal_name, address, description_of_goods, hs_code")
          .eq("id", booking.consignee_gst_entry_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("document_templates")
      .select("template_config")
      .eq("company_id", DEFAULT_COMPANY_ID)
      .eq("doc_type", "booking_instruction")
      .eq("is_default", true)
      .single(),
  ]);

  if (!templateRow?.template_config) {
    return NextResponse.json(
      { error: "No Booking Instructions letterhead set up yet -- add one in Settings or run migration 0023." },
      { status: 400 }
    );
  }

  const buyerParty = (booking.booking_parties ?? []).find((bp: any) => bp.role === "buyer")?.parties ?? null;
  const packingItems = ((container as any)?.packing_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order);
  const firstPacking = packingItems[0];

  // Auto-filled first, then any explicit review-screen edit (body.overrides)
  // wins -- identical "AI/auto-filled, always correctable" merge as the
  // Final Invoice route.
  const autoFilled: InstructionFieldData = {
    booking_number: booking.carrier_booking_no || "",
    container_number: (container as any)?.container_no || "",
    seal_no: firstPacking?.seal_no || (container as any)?.seal_no || "",
    weight: firstPacking?.weight != null ? String(firstPacking.weight) : booking.gross_weight != null ? String(booking.gross_weight) : "",
    weight_unit: firstPacking?.weight_unit || "LBS",
    bales: firstPacking?.bales != null ? String(firstPacking.bales) : "",
    consignee_name: gstEntry?.legal_name || buyerParty?.legal_name || "",
    consignee_address: gstEntry?.address || buyerParty?.address || "",
    notify_name: gstEntry?.legal_name || buyerParty?.legal_name || "",
    notify_address: gstEntry?.address || buyerParty?.address || "",
    description_of_goods: gstEntry?.description_of_goods || booking.commodity || "",
    hs_code: gstEntry?.hs_code || booking.hs_code || "",
    value: "",
    destination: booking.final_destination || "",
    instruction_date: new Date().toISOString().slice(0, 10),
  };
  const finalData: InstructionFieldData = { ...autoFilled, ...(body.overrides ?? {}) };

  if (!finalData.consignee_name) {
    return NextResponse.json({ error: "This booking has no Buyer assigned yet -- can't generate a consignee." }, { status: 400 });
  }
  if (!finalData.booking_number) {
    return NextResponse.json({ error: "This booking has no Booking Number yet." }, { status: 400 });
  }

  const pdfBytes = await generateBookingInstructionsPdf(templateRow.template_config as InstructionTemplateConfig, finalData);

  const { count } = await supabase
    .from("generated_documents")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", params.id);
  const version = (count ?? 0) + 1;

  // Filename is INST-{Booking Number} per spec, kept filesystem-safe.
  const safeBookingNo = finalData.booking_number.replace(/[^A-Za-z0-9_-]/g, "_");
  const filePath = `${DEFAULT_COMPANY_ID}/bookings/${params.id}/INST-${safeBookingNo}_v${version}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `PDF generated but upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: doc, error: insertError } = await supabase
    .from("generated_documents")
    .insert({
      company_id: DEFAULT_COMPANY_ID,
      booking_id: params.id,
      doc_type: "booking_instruction",
      field_data: finalData,
      pdf_path: filePath,
      version,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { data: signedUrl } = await supabase.storage.from("documents").createSignedUrl(filePath, 60 * 60);

  return NextResponse.json({ document: doc, url: signedUrl?.signedUrl });
}
