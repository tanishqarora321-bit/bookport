import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { parseDateish } from "@/lib/parse-date";

export const maxDuration = 300;

function parseNumeric(v: string): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

type Skip = { row: number; reason: string };

// Simpler than the supplier import's commit route: a real buyer
// account-statement sheet is one row = one complete invoice (no
// row-grouping needed), with Invoice Value/Freight/Trucking/Commission as
// separate numeric columns on that same row, each becoming one
// buyer_invoice_items row.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const companyId = me.company_id;

  const body = await req.json();
  const buyerId: string = body.buyerId;
  const headers: string[] = body.headers ?? [];
  const rows: string[][] = body.rows ?? [];
  const mapping: Record<string, string | null> = body.mapping ?? {};

  if (!buyerId) return NextResponse.json({ error: "buyerId is required" }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }

  const colIndex: Record<string, number> = {};
  for (const [key, headerName] of Object.entries(mapping)) {
    if (!headerName) continue;
    const idx = headers.indexOf(headerName);
    if (idx !== -1) colIndex[key] = idx;
  }

  if (colIndex["invoice_number"] === undefined) {
    return NextResponse.json({ error: "Invoice Number must be mapped to a column before importing." }, { status: 400 });
  }

  const get = (row: string[], key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

  const supabase = createServiceClient();

  // buyerId comes straight from the request body - verify it's actually
  // this company's buyer before importing anything onto it.
  const { data: buyerParty, error: buyerLookupError } = await supabase
    .from("parties")
    .select("id")
    .eq("id", buyerId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (buyerLookupError) return NextResponse.json({ error: buyerLookupError.message }, { status: 500 });
  if (!buyerParty) return NextResponse.json({ error: "Buyer not found" }, { status: 404 });

  const { data: existingInvoices } = await supabase
    .from("buyer_invoices")
    .select("invoice_number")
    .eq("company_id", companyId)
    .eq("buyer_id", buyerId);
  const existingKeys = new Set(
    (existingInvoices ?? [])
      .map((inv: { invoice_number: string | null }) => (inv.invoice_number ?? "").toLowerCase())
      .filter(Boolean)
  );

  const skipped: Skip[] = [];
  let imported = 0;

  async function processRow(i: number) {
    const sheetRow = i + 2;
    const row = rows[i];
    const invoiceNumber = get(row, "invoice_number");

    if (!invoiceNumber) {
      skipped.push({ row: sheetRow, reason: "No Invoice Number on this row" });
      return;
    }

    const dedupKey = invoiceNumber.toLowerCase();
    if (existingKeys.has(dedupKey)) {
      skipped.push({ row: sheetRow, reason: `An invoice numbered "${invoiceNumber}" already exists for this buyer - skipped to avoid duplicating charges` });
      return;
    }
    existingKeys.add(dedupKey); // claim it now so a second identical row in this same file also skips, not double-imports.

    const bookingNumber = get(row, "booking_number");
    const containerNumber = get(row, "container_number");

    // Live ETA/forwarder link + fallback for tracking_id - same matching
    // priority as the supplier import (booking number first, container as
    // fallback), but here the container fallback matters more since a
    // real buyer sheet often has no booking_number at all.
    let trackingId: string | null = null;
    let monthOfLoading: string | null = null;
    let forwarderName: string | null = null;
    {
      const SELECT = "id, forwarder_id, eta";
      let tracking: { id: string; forwarder_id: string | null; eta: string | null } | null = null;
      if (bookingNumber) {
        const { data } = await supabase
          .from("tracking")
          .select(SELECT)
          .eq("company_id", companyId)
          .eq("booking_number", bookingNumber)
          .maybeSingle();
        tracking = data;
      }
      if (!tracking && containerNumber) {
        const { data } = await supabase
          .from("tracking")
          .select(SELECT)
          .eq("company_id", companyId)
          .eq("container_number", containerNumber)
          .maybeSingle();
        tracking = data;
      }
      if (tracking) {
        trackingId = tracking.id;
        monthOfLoading = tracking.eta ? tracking.eta.slice(0, 10) : null;
        if (tracking.forwarder_id) {
          const { data: forwarder } = await supabase.from("parties").select("legal_name").eq("id", tracking.forwarder_id).single();
          forwarderName = forwarder?.legal_name ?? null;
        }
      }
    }

    const invoiceDateRaw = get(row, "invoice_date");
    const blDateRaw = get(row, "bl_date");
    const dueDateRaw = get(row, "due_date");
    const parsedInvoiceDate = invoiceDateRaw ? parseDateish(invoiceDateRaw) : null;
    const parsedBlDate = blDateRaw ? parseDateish(blDateRaw) : null;
    const parsedDueDate = dueDateRaw ? parseDateish(dueDateRaw) : null;

    const weight = parseNumeric(get(row, "weight"));
    const invoiceValue = parseNumeric(get(row, "invoice_value"));
    const freight = parseNumeric(get(row, "freight"));
    const trucking = parseNumeric(get(row, "trucking"));
    const commission = parseNumeric(get(row, "commission"));

    const { data: invoice, error: invoiceError } = await supabase
      .from("buyer_invoices")
      .insert({
        company_id: companyId,
        buyer_id: buyerId,
        tracking_id: trackingId,
        booking_number: bookingNumber || null,
        container_number: containerNumber || null,
        location: get(row, "location") || null,
        month_of_loading: monthOfLoading,
        bl_date: parsedBlDate ? parsedBlDate.toISOString().slice(0, 10) : null,
        due_date: parsedDueDate ? parsedDueDate.toISOString().slice(0, 10) : null,
        forwarder_name: forwarderName,
        invoice_number: invoiceNumber,
        invoice_date: parsedInvoiceDate ? parsedInvoiceDate.toISOString().slice(0, 10) : null,
        weight,
      })
      .select("id")
      .single();

    if (invoiceError) {
      skipped.push({ row: sheetRow, reason: `Couldn't create invoice "${invoiceNumber}": ${invoiceError.message}` });
      return;
    }

    const items = [
      { description: "Invoice Value", amount: invoiceValue },
      { description: "Freight", amount: freight },
      { description: "Trucking", amount: trucking },
      { description: "Commission", amount: commission },
    ]
      .filter((it) => it.amount !== null && it.amount !== 0)
      .map((it, idx) => ({
        buyer_invoice_id: invoice.id,
        description: it.description,
        weight_kg: null,
        unit_price: null,
        amount: it.amount,
        sort_order: idx,
      }));

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from("buyer_invoice_items").insert(items);
      if (itemsError) {
        skipped.push({ row: sheetRow, reason: `Invoice "${invoiceNumber}" created, but its cost lines failed: ${itemsError.message}` });
        return;
      }
    }

    imported++;
  }

  // Different rows are independent, so they run concurrently - a real
  // statement with hundreds of rows hits the same 60-second serverless
  // timeout the forwarder/supplier invoice imports hit before that fix.
  const CONCURRENCY = 20;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, rows.length - i) }, (_, j) => i + j).map(processRow)
    );
  }

  return NextResponse.json({ imported, total: rows.length, skipped });
}
