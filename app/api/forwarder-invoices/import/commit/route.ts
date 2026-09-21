import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import { FORWARDER_INVOICE_DATE_KEYS, FORWARDER_INVOICE_NUMERIC_KEYS } from "@/lib/forwarder-invoice-import-fields";

export const maxDuration = 60;

function parseDateish(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

type Skip = { row: number; reason: string };

// Fills in charge data on invoice rows that already exist (auto-created
// from Booking & Instructions, see migration 0015) - this never creates
// a booking or an invoice shell. A sheet row with no matching pending
// invoice is skipped and reported, not silently ignored.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const forwarderId: string = body.forwarderId;
  const headers: string[] = body.headers ?? [];
  const rows: string[][] = body.rows ?? [];
  const mapping: Record<string, string | null> = body.mapping ?? {};
  const customKeys: string[] = body.customKeys ?? [];

  if (!forwarderId) return NextResponse.json({ error: "forwarderId is required" }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }

  const colIndex: Record<string, number> = {};
  for (const [key, headerName] of Object.entries(mapping)) {
    if (!headerName) continue;
    const idx = headers.indexOf(headerName);
    if (idx !== -1) colIndex[key] = idx;
  }

  if (colIndex["booking_number"] === undefined) {
    return NextResponse.json({ error: "Booking Number must be mapped to a column before importing." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: existingInvoices, error: fetchError } = await supabase
    .from("forwarder_invoices")
    .select("id, booking_number, container_number")
    .eq("company_id", DEFAULT_COMPANY_ID)
    .eq("forwarder_id", forwarderId);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  // Index by booking number (lowercased) - a list, since one booking can
  // have several containers/invoice rows.
  const byBooking = new Map<string, { id: string; container_number: string | null }[]>();
  for (const inv of existingInvoices ?? []) {
    const key = (inv.booking_number ?? "").toLowerCase();
    if (!byBooking.has(key)) byBooking.set(key, []);
    byBooking.get(key)!.push({ id: inv.id, container_number: inv.container_number });
  }

  const skipped: Skip[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRow = i + 2;
    const get = (key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

    const bookingNumber = get("booking_number");
    if (!bookingNumber) {
      skipped.push({ row: sheetRow, reason: "Booking Number is blank" });
      continue;
    }
    const containerNumber = get("container_number");

    const candidates = byBooking.get(bookingNumber.toLowerCase()) ?? [];
    let targetId: string | null = null;
    if (candidates.length === 0) {
      skipped.push({ row: sheetRow, reason: `No pending invoice found for booking "${bookingNumber}" under this forwarder - add it in Booking & Instructions first` });
      continue;
    } else if (candidates.length === 1) {
      targetId = candidates[0].id;
    } else if (containerNumber) {
      const match = candidates.find((c) => (c.container_number ?? "").toLowerCase() === containerNumber.toLowerCase());
      if (!match) {
        skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" has multiple containers here, but "${containerNumber}" isn't one of them` });
        continue;
      }
      targetId = match.id;
    } else {
      skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" has multiple containers - map Container Number to disambiguate` });
      continue;
    }

    const updates: Record<string, any> = {};
    const customCharges: Record<string, number> = {};
    for (const [key] of Object.entries(mapping)) {
      if (key === "booking_number" || key === "container_number") continue;
      const raw = get(key);
      if (!raw) continue;
      if (customKeys.includes(key)) {
        customCharges[key] = Number(raw) || 0;
      } else if (FORWARDER_INVOICE_DATE_KEYS.has(key)) {
        updates[key] = parseDateish(raw);
      } else if (FORWARDER_INVOICE_NUMERIC_KEYS.has(key)) {
        updates[key] = Number(raw) || 0;
      } else {
        updates[key] = raw;
      }
    }

    if (Object.keys(customCharges).length > 0) {
      const { data: existing } = await supabase.from("forwarder_invoices").select("custom_charges").eq("id", targetId).single();
      updates.custom_charges = { ...(existing?.custom_charges ?? {}), ...customCharges };
    }

    if (Object.keys(updates).length === 0) {
      skipped.push({ row: sheetRow, reason: "No mapped charge fields had a value" });
      continue;
    }

    updates.updated_at = new Date().toISOString();
    const { error: updateError } = await supabase.from("forwarder_invoices").update(updates).eq("id", targetId);
    if (updateError) {
      skipped.push({ row: sheetRow, reason: updateError.message });
      continue;
    }
    imported++;
  }

  return NextResponse.json({ imported, total: rows.length, skipped });
}
