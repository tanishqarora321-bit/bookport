import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import {
  SUPPLIER_INVOICE_DATE_KEYS,
  SUPPLIER_INVOICE_NUMERIC_KEYS,
  SUPPLIER_INVOICE_HEADER_KEYS
} from "@/lib/supplier-invoice-import-fields";
import { parseDateish } from "@/lib/parse-date";

export const maxDuration = 300;

function parseNumeric(v: string): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

function defaultAmount(weight: number | null, price: number | null, amount: number | null): number {
  if (amount !== null) return amount;
  if (weight === null || price === null) return 0;
  return Math.round(weight * price * 100) / 100;
}

type Skip = { row: number; reason: string };
type Group = { startRow: number; rowIndices: number[] };

// A supplier statement is one invoice spread across several rows: a row
// with a Booking Number starts a new invoice, and every row under it
// with a BLANK Booking Number is that invoice's next cost-section line
// (Description/Weight/Unit Price/Amount), until the next non-blank
// Booking Number starts the next invoice. Header fields (Forwarder,
// Consignee, Container, Invoice Number/Date) are usually only present
// on a group's first row, but any row in the group can supply them.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const companyId = me.company_id;

  const body = await req.json();
  const supplierId: string = body.supplierId;
  const headers: string[] = body.headers ?? [];
  const rows: string[][] = body.rows ?? [];
  const mapping: Record<string, string | null> = body.mapping ?? {};
  const currency: string = body.currency || "EUR";
  const fxRate: number = Number(body.fxRate) || 1;

  if (!supplierId) return NextResponse.json({ error: "supplierId is required" }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // The supplierId posted from the client must actually belong to this
  // company before any row is processed - otherwise a crafted supplierId
  // could get invoices imported against a party that isn't actually this
  // company's supplier.
  const { data: supplierCheck, error: supplierCheckError } = await supabase
    .from("parties")
    .select("id")
    .eq("id", supplierId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (supplierCheckError) return NextResponse.json({ error: supplierCheckError.message }, { status: 500 });
  if (!supplierCheck) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const colIndex: Record<string, number> = {};
  for (const [key, headerName] of Object.entries(mapping)) {
    if (!headerName) continue;
    const idx = headers.indexOf(headerName);
    if (idx !== -1) colIndex[key] = idx;
  }

  if (colIndex["booking_number"] === undefined) {
    return NextResponse.json({ error: "Booking Number must be mapped to a column before importing." }, { status: 400 });
  }

  const get = (row: string[], key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

  const skipped: Skip[] = [];
  const groups: Group[] = [];
  let current: Group | null = null;

  for (let i = 0; i < rows.length; i++) {
    const sheetRow = i + 2;
    const bookingNumber = get(rows[i], "booking_number");
    if (bookingNumber) {
      current = { startRow: sheetRow, rowIndices: [i] };
      groups.push(current);
    } else if (current) {
      current.rowIndices.push(i);
    } else {
      skipped.push({ row: sheetRow, reason: "No Booking Number on this row or any row above it to attach this line to" });
    }
  }

  if (groups.length === 0) {
    return NextResponse.json({ imported: 0, total: 0, skipped });
  }

  const { data: existingInvoices } = await supabase
    .from("supplier_invoices")
    .select("booking_number, container_number, invoice_number")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId);
  // A real statement bills the same booking+container more than once over
  // time (separate invoice documents) - tracking invoice_number alongside
  // the dedup key lets a genuinely different invoice through instead of
  // silently dropping it (found live: a Walker International statement
  // with repeat booking+container rows for later, separate invoices).
  const existingByKey = new Map<string, string | null>(
    (existingInvoices ?? []).map((inv: { booking_number: string | null; container_number: string | null; invoice_number: string | null }) =>
      [`${(inv.booking_number ?? "").toLowerCase()}::${(inv.container_number ?? "").toLowerCase()}`, inv.invoice_number]
    )
  );

  let imported = 0;

  async function processGroup(group: Group) {
    const firstRow = rows[group.rowIndices[0]];
    const bookingNumber = get(firstRow, "booking_number");

    const header: Record<string, string> = {};
    for (const key of SUPPLIER_INVOICE_HEADER_KEYS) {
      for (const i of group.rowIndices) {
        const raw = get(rows[i], key);
        if (raw) {
          header[key] = raw;
          break;
        }
      }
    }
    const containerNumber = header["container_number"] || "";

    const dedupKey = `${bookingNumber.toLowerCase()}::${containerNumber.toLowerCase()}`;
    const newInvoiceNumber = (header["invoice_number"] || "").trim();
    // True when this booking+container already has an invoice AND this
    // group is a genuinely different one (non-blank, differing Invoice
    // Number) - a later, separate invoice document, not a re-import of the
    // one already on file. Also tracked below to skip linking tracking_id
    // on it: supplier_invoices (like forwarder/trucker) only allows one row
    // per tracking_id, which the first invoice for this container already
    // holds.
    let isSeparateInvoiceOfExisting = false;
    if (existingByKey.has(dedupKey)) {
      const existingInvoiceNumber = (existingByKey.get(dedupKey) || "").trim();
      isSeparateInvoiceOfExisting = !!newInvoiceNumber && !!existingInvoiceNumber && newInvoiceNumber.toLowerCase() !== existingInvoiceNumber.toLowerCase();
      if (!isSeparateInvoiceOfExisting) {
        skipped.push({ row: group.startRow, reason: `An invoice for booking "${bookingNumber}"${containerNumber ? ` / container "${containerNumber}"` : ""} already exists for this supplier - skipped to avoid duplicating charges` });
        return;
      }
    }
    existingByKey.set(dedupKey, newInvoiceNumber || existingByKey.get(dedupKey) || null); // claim it now so a third identical group in this same file compares against the latest invoice number too.

    // Live ETA/status link + fallback for any header field the sheet
    // didn't carry on its own - same matching priority the single
    // "+ Add Invoice" lookup uses (booking number first, container as
    // fallback), never overwriting a value the sheet already gave.
    let trackingId: string | null = null;
    let monthOfLoading: string | null = null;
    {
      const SELECT = "id, booking_id, party_id, forwarder_id, eta";
      let { data: tracking } = await supabase
        .from("tracking")
        .select(SELECT)
        .eq("company_id", companyId)
        .eq("booking_number", bookingNumber)
        .maybeSingle();
      if (!tracking && containerNumber) {
        const { data: byContainer } = await supabase
          .from("tracking")
          .select(SELECT)
          .eq("company_id", companyId)
          .eq("container_number", containerNumber)
          .maybeSingle();
        tracking = byContainer;
      }
      if (tracking) {
        if (!isSeparateInvoiceOfExisting) trackingId = tracking.id;
        monthOfLoading = tracking.eta ? tracking.eta.slice(0, 10) : null;
        const [{ data: party }, { data: forwarder }] = await Promise.all([
          tracking.party_id ? supabase.from("parties").select("legal_name").eq("id", tracking.party_id).single() : Promise.resolve({ data: null as any }),
          tracking.forwarder_id ? supabase.from("parties").select("legal_name").eq("id", tracking.forwarder_id).single() : Promise.resolve({ data: null as any }),
        ]);
        if (!header["consignee_name"] && party?.legal_name) header["consignee_name"] = party.legal_name;
        if (!header["forwarder_name"] && forwarder?.legal_name) header["forwarder_name"] = forwarder.legal_name;
      }
    }

    const invoiceDateRaw = header["invoice_date"];
    const parsedDate = invoiceDateRaw ? parseDateish(invoiceDateRaw) : null;

    const { data: invoice, error: invoiceError } = await supabase
      .from("supplier_invoices")
      .insert({
        company_id: companyId,
        supplier_id: supplierId,
        tracking_id: trackingId,
        booking_number: bookingNumber,
        container_number: containerNumber || null,
        month_of_loading: monthOfLoading,
        forwarder_name: header["forwarder_name"] || null,
        consignee_name: header["consignee_name"] || null,
        invoice_number: header["invoice_number"] || null,
        invoice_date: parsedDate ? parsedDate.toISOString().slice(0, 10) : null,
        currency,
        fx_rate: fxRate,
      })
      .select("id")
      .single();

    if (invoiceError) {
      skipped.push({ row: group.startRow, reason: `Couldn't create invoice for booking "${bookingNumber}": ${invoiceError.message}` });
      return;
    }

    const items = group.rowIndices
      .map((i, idx) => {
        const row = rows[i];
        const description = get(row, "description");
        const weight = parseNumeric(get(row, "weight_kg"));
        const price = parseNumeric(get(row, "unit_price"));
        const amount = parseNumeric(get(row, "amount"));
        if (!description && weight === null && price === null && amount === null) return null;
        return {
          supplier_invoice_id: invoice.id,
          description: description || null,
          weight_kg: weight,
          unit_price: price,
          amount: defaultAmount(weight, price, amount),
          sort_order: idx,
        };
      })
      .filter((it): it is NonNullable<typeof it> => it !== null);

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from("supplier_invoice_items").insert(items);
      if (itemsError) {
        skipped.push({ row: group.startRow, reason: `Invoice for booking "${bookingNumber}" created, but its cost lines failed: ${itemsError.message}` });
        return;
      }
    }

    imported++;
  }

  // Different invoice groups are independent, so they run concurrently -
  // a real statement with dozens of multi-line invoices did the same
  // 60-second timeout the forwarder invoice import hit before that fix.
  const CONCURRENCY = 20;
  for (let i = 0; i < groups.length; i += CONCURRENCY) {
    await Promise.all(groups.slice(i, i + CONCURRENCY).map(processGroup));
  }

  return NextResponse.json({ imported, total: groups.length, skipped });
}
