import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { INVOICE_KIND_LABEL, INVOICE_PARTY_COLUMN, INVOICE_TABLE, listInvoicePdfs, parseInvoicePdfName, type InvoiceKind } from "@/lib/party-invoice-pdf";
import { generateFinalInvoicePdf, TemplateConfig, InvoiceFieldData } from "@/lib/pdf/generateFinalInvoice";
import { buildFinalInvoiceDefaults } from "@/lib/final-invoice-defaults";
import { chargeKeyOf, setBuyerCharges } from "@/lib/buyer-charges";
import { findOrCreateItem } from "@/lib/buyer-items";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();

  const { data: tracking, error: trackingError } = await supabase
    .from("tracking")
    .select("id")
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .single();
  if (trackingError || !tracking) {
    return NextResponse.json({ error: "Tracking entry not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("generated_documents")
    .select("id, doc_type, field_data, pdf_path, version, created_at")
    .eq("tracking_id", params.id)
    .order("version", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Forwarder / Trucker / Supplier invoice PDFs uploaded in those ledgers
  // for this container (lib/party-invoice-pdf.ts), with invoice number and
  // party. A file whose invoice no longer exists is never listed.
  const files = await listInvoicePdfs(supabase, me.company_id, params.id);
  const uploaded: { name: string; label: string; invoice_number: string | null; forwarder: string | null; uploaded_at: string | null }[] = [];
  const byKind = new Map<InvoiceKind, string[]>();
  for (const f of files) {
    const p = parseInvoicePdfName(f.name);
    if (p) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p.id]);
  }
  const invoiceInfo = new Map<string, { invoice_number: string | null; party: string | null }>();
  for (const [kind, ids] of byKind) {
    const { data: rows } = await supabase
      .from(INVOICE_TABLE[kind])
      .select(`id, invoice_number, party:${INVOICE_PARTY_COLUMN[kind]} (legal_name)`)
      .in("id", ids);
    for (const r of (rows ?? []) as any[]) invoiceInfo.set(`${kind}:${r.id}`, { invoice_number: r.invoice_number, party: r.party?.legal_name ?? null });
  }
  for (const f of files) {
    const p = parseInvoicePdfName(f.name)!;
    const info = invoiceInfo.get(`${p.kind}:${p.id}`);
    if (!info) continue;
    uploaded.push({ name: f.name, label: INVOICE_KIND_LABEL[p.kind], invoice_number: info.invoice_number, forwarder: info.party, uploaded_at: f.updated_at || f.created_at || null });
  }

  return NextResponse.json({ documents: data ?? [], uploaded });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();
  const overridesIn: Record<string, any> = body.overrides ?? {};

  // 0. The goods line's Item (owner, 2026-11) is required: a new one is
  // added to the Items tab, and it's stored on the shipment
  // (tracking.item_id) - what Profit & Loss groups goods by.
  if (Array.isArray(overridesIn.items)) {
    const used = overridesIn.items.filter(
      (l: any) => String(l.description ?? "").trim() || String(l.weight_kg ?? "").trim() || String(l.unit_price ?? "").trim() || String(l.amount ?? "").trim()
    );
    if (used.length === 0 || used.some((l: any) => !String(l.description ?? "").trim())) {
      return NextResponse.json({ error: "Select the Item before generating." }, { status: 400 });
    }
    const { data: trk } = await supabase.from("tracking").select("id").eq("id", params.id).eq("company_id", me.company_id).maybeSingle();
    if (trk) {
      let firstItemId: string | null = null;
      for (const l of used) {
        const item = await findOrCreateItem(supabase, me.company_id, String(l.description));
        if (!item) continue;
        firstItemId = firstItemId ?? item.id;
      }
      if (firstItemId) await supabase.from("tracking").update({ item_id: firstItemId }).eq("id", trk.id);
    }
  }

  // 1. The Final Invoice page's edits that belong to the Buyers ledger row
  // are saved there first (owner, 2026-11), so the ledger and the printed
  // invoice never disagree: Date, Weight, the goods lines (weight x rate)
  // and Ocean Freight / Commission / Trucking. Everything else edited on
  // the page (terms, reference, seal, ship via, bales, supplier line...)
  // is for this print only and kept on the version.
  if (body.save_to_ledger) {
    const { data: bi } = await supabase
      .from("buyer_invoices")
      .select("id")
      .eq("tracking_id", params.id)
      .eq("company_id", me.company_id)
      .maybeSingle();
    if (bi) {
      const updates: Record<string, any> = {};
      if (overridesIn.invoice_date) updates.invoice_date = overridesIn.invoice_date;
      if (overridesIn.weight_lbs !== undefined) {
        const w = parseFloat(String(overridesIn.weight_lbs).replace(/[^0-9.]/g, ""));
        updates.weight = Number.isFinite(w) ? w : null;
      }
      if (overridesIn.weight_unit) updates.weight_unit = /^KG/i.test(overridesIn.weight_unit) ? "KG" : "LBS";
      if (Object.keys(updates).length) {
        updates.updated_at = new Date().toISOString();
        await supabase.from("buyer_invoices").update(updates).eq("id", bi.id);
      }
      if (Array.isArray(overridesIn.items)) {
        const { data: current } = await supabase.from("buyer_invoice_items").select("id, description, weight_kg, unit_price, amount").eq("buyer_invoice_id", bi.id);
        const goodsIds = (current ?? []).filter((it: any) => !chargeKeyOf(it)).map((it: any) => it.id);
        if (goodsIds.length) await supabase.from("buyer_invoice_items").delete().in("id", goodsIds);
        const num = (v: any) => {
          const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
          return Number.isFinite(n) ? n : null;
        };
        const rows = overridesIn.items
          .map((it: any, i: number) => {
            const w = num(it.weight_kg);
            const r = num(it.unit_price);
            const amount = w !== null && r !== null ? Math.round(w * r * 100) / 100 : num(it.amount) ?? 0;
            return { buyer_invoice_id: bi.id, description: (it.description ?? "").toString().trim() || null, weight_kg: w, unit_price: r, amount, sort_order: i };
          })
          .filter((it: any) => it.description || it.weight_kg !== null || it.unit_price !== null || it.amount);
        if (rows.length) await supabase.from("buyer_invoice_items").insert(rows);
      }
      if (overridesIn.charges && typeof overridesIn.charges === "object") {
        await setBuyerCharges(supabase, bi.id, overridesIn.charges);
      }
    }
  }

  // 2. Defaults from the data the app already has (lib/final-invoice-
  // defaults.ts) - re-read after the save above. Anything edited on the
  // page wins, but a blank/null override never wipes a default (that's how
  // a missing invoice date used to print as 01/01/1970).
  const defaults = await buildFinalInvoiceDefaults(supabase, params.id, me.company_id);
  if (!defaults) return NextResponse.json({ error: "Tracking entry not found" }, { status: 404 });
  if (!defaults.templateConfig) {
    return NextResponse.json(
      { error: "No document template set up for this company yet -- add your letterhead in Settings." },
      { status: 400 }
    );
  }
  const overrides: Record<string, any> = {};
  for (const [k, val] of Object.entries(overridesIn)) {
    if (k === "items" || k === "charges") continue; // read back from the ledger (saved above)
    if (val == null || val === "") continue;
    if (Array.isArray(val) && val.length === 0) continue;
    overrides[k] = val;
  }
  // Without the ledger save (no buyer invoice), the page's lines/charges
  // still print.
  if (!body.save_to_ledger || !defaults.buyerInvoiceId) {
    if (Array.isArray(overridesIn.items)) overrides.items = overridesIn.items;
    if (overridesIn.charges) overrides.charges = overridesIn.charges;
  }
  const finalData: InvoiceFieldData = { ...defaults.data, ...overrides };

  if (!finalData.consignee_name) {
    return NextResponse.json({ error: "This tracking entry has no party assigned yet -- can't generate a consignee." }, { status: 400 });
  }
  if (!finalData.invoice_no) {
    return NextResponse.json({ error: "Generate an invoice number on this row first." }, { status: 400 });
  }
  const templateRow = { template_config: defaults.templateConfig };

  // 3. Render the PDF.
  const pdfBytes = await generateFinalInvoicePdf(templateRow.template_config as TemplateConfig, finalData);

  // 4. Version = count of prior docs for this tracking row + 1. Old
  // versions are never overwritten or deleted -- see migration 0005 notes.
  const { count } = await supabase
    .from("generated_documents")
    .select("id", { count: "exact", head: true })
    .eq("tracking_id", params.id);
  const version = (count ?? 0) + 1;

  const filePath = `${me.company_id}/${params.id}/final_invoice_v${version}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `PDF generated but upload failed: ${uploadError.message}. Confirm a "documents" storage bucket exists (README setup step 3).` },
      { status: 500 }
    );
  }

  const { data: doc, error: insertError } = await supabase
    .from("generated_documents")
    .insert({
      company_id: me.company_id,
      tracking_id: params.id,
      doc_type: "final_invoice",
      field_data: finalData,
      pdf_path: filePath,
      version,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Generating a PDF no longer marks it "Sent" - Invoice Sent / Docs Sent
  // flip only when the PDF is actually emailed from Shipment Tracking's
  // Docs dialog (app/api/tracking/[id]/send-docs).

  const { data: signedUrl } = await supabase.storage.from("documents").createSignedUrl(filePath, 60 * 60);

  return NextResponse.json({ document: doc, url: signedUrl?.signedUrl });
}
