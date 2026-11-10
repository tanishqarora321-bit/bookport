import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { sendEmail } from "@/lib/send-email";

export const maxDuration = 60;

// Shipment Tracking's Docs dialog: emails the buyer/consignee the PDFs
// generated in the Buyers ledger, attached to the mail (same compose ->
// preview -> send flow as Send Instructions).
//   kind "invoice"   -> the latest Final Invoice PDF; flips Invoice Sent.
//   kind "documents" -> the latest Fumigation Certificate, Certificate of
//                       Origin and Set of Documents; flips Docs Sent.
// `preview: true` builds the mail without sending it.
const KIND_DOCS: Record<"invoice" | "documents", { type: string; label: string }[]> = {
  invoice: [{ type: "final_invoice", label: "Invoice" }],
  documents: [
    { type: "fumigation_certificate", label: "Fumigation Certificate" },
    { type: "certificate_of_origin", label: "Certificate of Origin" },
    { type: "set_of_documents", label: "Set of Documents" },
  ],
};

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const kind: "invoice" | "documents" = body.kind === "documents" ? "documents" : "invoice";
  const supabase = createServiceClient();

  const { data: tracking } = await supabase
    .from("tracking")
    .select("id, booking_id, booking_number, container_number, invoice_no, party_id")
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .maybeSingle();
  if (!tracking) return NextResponse.json({ error: "Tracking entry not found" }, { status: 404 });

  const [{ data: buyer }, { data: buyerInvoice }, { data: docs }, { data: letterheadRow }, { data: company }] = await Promise.all([
    tracking.party_id
      ? supabase.from("parties").select("legal_name, short_code, email, cc_email").eq("id", tracking.party_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    supabase.from("buyer_invoices").select("invoice_number").eq("tracking_id", params.id).maybeSingle(),
    supabase
      .from("generated_documents")
      .select("id, doc_type, pdf_path, version, created_at")
      .eq("tracking_id", params.id)
      .order("version", { ascending: false }),
    supabase
      .from("document_templates")
      .select("template_config")
      .eq("company_id", me.company_id)
      .eq("doc_type", "booking_instruction")
      .eq("is_default", true)
      .maybeSingle(),
    supabase.from("companies").select("name").eq("id", me.company_id).maybeSingle(),
  ]);

  if (!buyer) {
    return NextResponse.json(
      { error: "This container has no Buyer / Consignee assigned yet - assign one in Booking & Instructions first." },
      { status: 400 }
    );
  }

  // Latest version of each wanted document type.
  const wanted = KIND_DOCS[kind];
  const found: { type: string; label: string; doc: any }[] = [];
  const missing: string[] = [];
  for (const w of wanted) {
    const doc = (docs ?? []).filter((d: any) => d.doc_type === w.type && d.pdf_path).sort((a: any, b: any) => b.version - a.version)[0];
    if (doc) found.push({ ...w, doc });
    else missing.push(w.label);
  }
  if (found.length === 0) {
    return NextResponse.json(
      {
        error:
          kind === "invoice"
            ? "No invoice has been generated for this container yet - use Generate Invoice in the Buyers / Consignee ledger first."
            : "None of the documents (Fumigation Certificate, Certificate of Origin, Set of Documents) has been generated yet - generate them in the Buyers / Consignee ledger first.",
      },
      { status: 400 }
    );
  }

  const invoiceNo = buyerInvoice?.invoice_number || tracking.invoice_no || "";
  const ref = [tracking.booking_number && `Booking ${tracking.booking_number}`, tracking.container_number && `Container ${tracking.container_number}`]
    .filter(Boolean)
    .join(" / ");
  const subject =
    kind === "invoice"
      ? `Invoice${invoiceNo ? ` ${invoiceNo}` : ""}${ref ? ` - ${ref}` : ""}`
      : `Shipping documents${ref ? ` - ${ref}` : ""}`;

  const attachments = found.map((f) => {
    const base =
      f.type === "final_invoice"
        ? `Invoice ${invoiceNo || tracking.container_number || ""}`
        : `${f.label} ${tracking.container_number || tracking.booking_number || ""}`;
    return { ...f, filename: `${safeName(base) || f.label}.pdf` };
  });

  const companyName = (letterheadRow?.template_config as any)?.company_name || company?.name || "";
  const senderName = me.full_name || me.email;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5;">
  <p>Dear ${escapeHtml(buyer.short_code || buyer.legal_name)} Team,</p>
  <p>Please find attached the ${kind === "invoice" ? "invoice" : "shipping documents"} for ${escapeHtml(ref || "this shipment")}.</p>
  <ul style="margin:6px 0 12px;padding-left:18px;">
    ${attachments.map((a) => `<li>${escapeHtml(a.label)}${a.type === "final_invoice" && invoiceNo ? ` (${escapeHtml(invoiceNo)})` : ""}</li>`).join("\n    ")}
  </ul>
  <p>Kindly acknowledge receipt.</p>
  <p style="margin-top:18px;">Regards,<br/>${escapeHtml(senderName)}${me.email ? `<br/>${escapeHtml(me.email)}` : ""}${companyName ? `<br/><b>${escapeHtml(companyName)}</b>` : ""}</p>
</div>`;

  const attachmentList = attachments.map((a) => ({
    id: a.doc.id,
    label: a.label,
    filename: a.filename,
    version: a.doc.version,
    created_at: a.doc.created_at,
  }));

  if (body.preview) {
    return NextResponse.json({
      subject,
      html,
      attachments: attachmentList,
      missing,
      suggested_to: buyer.email || "",
      suggested_cc: buyer.cc_email || "",
      buyer_missing_email: !buyer.email,
    });
  }

  const to: string[] = Array.isArray(body.to) ? body.to.map((s: any) => String(s).trim()).filter(Boolean) : [];
  if (to.length === 0) return NextResponse.json({ error: 'At least one "To" recipient is required.' }, { status: 400 });
  const cc: string[] = Array.isArray(body.cc) ? body.cc.map((s: any) => String(s).trim()).filter(Boolean) : [];

  // Download each PDF and attach it.
  const files: { filename: string; content: string }[] = [];
  for (const a of attachments) {
    const { data: blob, error } = await supabase.storage.from("documents").download(a.doc.pdf_path);
    if (error || !blob) {
      return NextResponse.json({ error: `Couldn't read the ${a.label} PDF: ${error?.message ?? "file missing"}` }, { status: 500 });
    }
    files.push({ filename: a.filename, content: Buffer.from(await blob.arrayBuffer()).toString("base64") });
  }

  const result = await sendEmail(supabase, {
    companyId: me.company_id,
    to,
    cc,
    subject,
    html,
    bookingId: tracking.booking_id,
    emailType: kind === "invoice" ? "buyer_invoice" : "buyer_documents",
    replyTo: me.email,
    attachments: files,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const flag = kind === "invoice" ? { invoice_sent: true } : { documents_sent: true };
  const { error: flagError } = await supabase
    .from("tracking")
    .update({ ...flag, updated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (flagError) {
    return NextResponse.json({ error: `Email sent, but marking it Sent failed: ${flagError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: result.id, ...flag });
}
