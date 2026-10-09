import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import {
  TRUCKER_INVOICE_DATE_KEYS,
  TRUCKER_INVOICE_NUMERIC_KEYS,
  TRUCKER_INVOICE_BOOKING_CREATE_KEYS
} from "@/lib/trucker-invoice-import-fields";
import { reserveBookingNos } from "@/lib/booking-number";
import { parseDateish } from "@/lib/parse-date";

export const maxDuration = 300;

// A charge column in someone's sheet showing "$1,983.00" is still just
// a number to a human - Number("$1,983.00") is NaN, which would silently
// become 0 here, erasing real charges on import without a single row
// being reported as skipped (found on the Forwarders import - fixed
// there first, ported here from the start).
function parseNumeric(v: string): number {
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

type Skip = { row: number; reason: string };

// Fills in charge data on invoice rows that already exist (auto-created
// from Booking & Instructions, see migration 0022). If a row's Booking
// Number doesn't exist ANYWHERE yet, creates that booking (with this
// trucker assigned). If the booking exists but is assigned to a
// different (or no) trucker, this sheet is treated as authoritative for
// who the real trucker is, so it reassigns it rather than skipping the
// row (same reattach-instead-of-duplicate trigger behavior as
// Forwarders/Suppliers). Ported from
// app/api/forwarder-invoices/import/commit/route.ts, including its
// concurrency fix (different bookings run in parallel; rows for the
// SAME booking still run in strict order) and the container-number
// exact-match fix for multi-container bookings.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const truckerId: string = body.truckerId;
  const headers: string[] = body.headers ?? [];
  const rows: string[][] = body.rows ?? [];
  const mapping: Record<string, string | null> = body.mapping ?? {};
  const customKeys: string[] = body.customKeys ?? [];

  if (!truckerId) return NextResponse.json({ error: "truckerId is required" }, { status: 400 });
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

  const [{ data: existingInvoices, error: fetchError }, { data: allBookings, error: bookingsError }] = await Promise.all([
    supabase
      .from("trucker_invoices")
      .select("id, booking_number, container_number")
      .eq("company_id", DEFAULT_COMPANY_ID)
      .eq("trucker_id", truckerId),
    supabase.from("bookings").select("id, carrier_booking_no").eq("company_id", DEFAULT_COMPANY_ID)
  ]);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (bookingsError) return NextResponse.json({ error: bookingsError.message }, { status: 500 });

  const byBooking = new Map<string, { id: string; container_number: string | null }[]>();
  for (const inv of existingInvoices ?? []) {
    const key = (inv.booking_number ?? "").toLowerCase();
    if (!byBooking.has(key)) byBooking.set(key, []);
    byBooking.get(key)!.push({ id: inv.id, container_number: inv.container_number });
  }

  const bookingIdByNumber = new Map<string, string>();
  for (const b of allBookings ?? []) {
    if (b.carrier_booking_no) bookingIdByNumber.set(b.carrier_booking_no.toLowerCase(), b.id);
  }

  // Upper bound: every row could turn out to need a new booking. Unused
  // reserved numbers are simply never written anywhere, so this can't
  // leave a gap - only actually-inserted bookings consume one. Safe to
  // hand out from concurrent rows below: a plain array index increment
  // can't interleave with another one mid-statement in JS.
  const reservedNos = await reserveBookingNos(supabase, rows.length);
  let reservedIdx = 0;

  const skipped: Skip[] = [];
  let imported = 0;

  async function processRow(i: number) {
    const row = rows[i];
    const sheetRow = i + 2;
    const get = (key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

    const bookingNumber = get("booking_number");
    const containerNumber = get("container_number");

    const candidates = byBooking.get(bookingNumber.toLowerCase()) ?? [];
    let targetId: string | null = null;
    let wasCreated = false;

    // When a container number is given, only an EXACT container match
    // counts as "already resolved" - see the identical comment in the
    // Forwarders import for why a lone-candidate shortcut is unsafe.
    const matchedCandidate = containerNumber
      ? candidates.find((c) => (c.container_number ?? "").toLowerCase() === containerNumber.toLowerCase())
      : candidates.length === 1
      ? candidates[0]
      : undefined;

    if (matchedCandidate) {
      targetId = matchedCandidate.id;
    } else if (!containerNumber && candidates.length > 1) {
      skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" has multiple containers - map Container Number to disambiguate` });
      return;
    } else if (bookingIdByNumber.has(bookingNumber.toLowerCase())) {
      // The booking exists but this trucker isn't the one assigned to it
      // (or none is) - this invoice sheet is treated as authoritative for
      // who the real trucker is, so link it.
      const existingBookingId = bookingIdByNumber.get(bookingNumber.toLowerCase())!;

      const { error: unassignError } = await supabase.from("booking_parties").delete().eq("booking_id", existingBookingId).eq("role", "trucker");
      if (unassignError) {
        skipped.push({ row: sheetRow, reason: `Couldn't link trucker to booking "${bookingNumber}": ${unassignError.message}` });
        return;
      }
      const { error: assignError } = await supabase.from("booking_parties").insert({ booking_id: existingBookingId, party_id: truckerId, role: "trucker" });
      if (assignError) {
        skipped.push({ row: sheetRow, reason: `Couldn't link trucker to booking "${bookingNumber}": ${assignError.message}` });
        return;
      }

      const { data: existingContainers } = await supabase
        .from("containers")
        .select("id, container_no")
        .eq("booking_id", existingBookingId)
        .not("container_no", "is", null);
      const matchingContainer = containerNumber
        ? (existingContainers ?? []).find((c: { id: string; container_no: string | null }) => (c.container_no ?? "").toLowerCase() === containerNumber.toLowerCase())
        : null;

      if (containerNumber && !matchingContainer) {
        const { error: containerError } = await supabase.from("containers").insert({ booking_id: existingBookingId, container_no: containerNumber });
        if (containerError) {
          skipped.push({ row: sheetRow, reason: `Trucker linked to "${bookingNumber}", but adding the container failed: ${containerError.message}` });
          return;
        }
      } else if ((existingContainers ?? []).length > 0) {
        for (const c of existingContainers ?? []) {
          await supabase.from("containers").update({ container_no: c.container_no }).eq("id", c.id);
        }
      } else {
        const { error: invError } = await supabase
          .from("trucker_invoices")
          .insert({
            company_id: DEFAULT_COMPANY_ID,
            trucker_id: truckerId,
            booking_number: bookingNumber,
            location: get("location") || null,
          });
        if (invError) {
          skipped.push({ row: sheetRow, reason: `Trucker linked to "${bookingNumber}", but the invoice shell failed: ${invError.message}` });
          return;
        }
      }

      let linkedInvoiceQuery = supabase
        .from("trucker_invoices")
        .select("id")
        .eq("trucker_id", truckerId)
        .eq("booking_number", bookingNumber);
      linkedInvoiceQuery = containerNumber
        ? linkedInvoiceQuery.eq("container_number", containerNumber)
        : linkedInvoiceQuery.is("container_number", null);
      const { data: linkedInvoice } = await linkedInvoiceQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      targetId = linkedInvoice?.id ?? null;
      if (!targetId) {
        skipped.push({ row: sheetRow, reason: `Trucker linked to "${bookingNumber}", but couldn't locate its invoice to fill in charges` });
        return;
      }
      wasCreated = true;
      const key = bookingNumber.toLowerCase();
      if (!byBooking.has(key)) byBooking.set(key, []);
      byBooking.get(key)!.push({ id: targetId, container_number: containerNumber || null });
    } else {
      // Booking Number doesn't exist anywhere - create it.
      wasCreated = true;
      const bookingFields: Record<string, any> = {
        carrier_booking_no: bookingNumber,
        booking_no: reservedNos[reservedIdx++],
        company_id: DEFAULT_COMPANY_ID,
        status: "confirmed"
      };
      for (const key of TRUCKER_INVOICE_BOOKING_CREATE_KEYS) {
        const raw = get(key);
        if (raw) bookingFields[key] = raw;
      }

      const { data: newBooking, error: bookingError } = await supabase.from("bookings").insert(bookingFields).select("id").single();
      if (bookingError) {
        skipped.push({ row: sheetRow, reason: `Couldn't create booking "${bookingNumber}": ${bookingError.message}` });
        return;
      }
      bookingIdByNumber.set(bookingNumber.toLowerCase(), newBooking.id);

      const { error: bpError } = await supabase.from("booking_parties").insert({ booking_id: newBooking.id, party_id: truckerId, role: "trucker" });
      if (bpError) {
        skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" created, but couldn't assign this trucker: ${bpError.message}` });
        return;
      }

      if (containerNumber) {
        const { error: containerError } = await supabase.from("containers").insert({ booking_id: newBooking.id, container_no: containerNumber });
        if (containerError) {
          skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" created, but adding the container failed: ${containerError.message}` });
          return;
        }
        const { data: createdInvoice } = await supabase
          .from("trucker_invoices")
          .select("id")
          .eq("trucker_id", truckerId)
          .eq("booking_number", bookingNumber)
          .eq("container_number", containerNumber)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        targetId = createdInvoice?.id ?? null;
      } else {
        const { data: createdInvoice, error: invError } = await supabase
          .from("trucker_invoices")
          .insert({
            company_id: DEFAULT_COMPANY_ID,
            trucker_id: truckerId,
            booking_number: bookingNumber,
            location: get("location") || null,
          })
          .select("id")
          .single();
        if (invError) {
          skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" created, but the invoice shell failed: ${invError.message}` });
          return;
        }
        targetId = createdInvoice?.id ?? null;
      }

      if (!targetId) {
        skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" created, but couldn't locate its invoice shell to fill in charges` });
        return;
      }

      const key = bookingNumber.toLowerCase();
      if (!byBooking.has(key)) byBooking.set(key, []);
      byBooking.get(key)!.push({ id: targetId, container_number: containerNumber || null });
    }

    const updates: Record<string, any> = {};

    // Backfills Month of Loading from the live tracking row's ETA when
    // it's still blank - covers every branch above (matched, linked, or
    // newly created). See the identical fix on the Forwarders import for
    // why: a charges-only sheet has no Month of Loading column of its
    // own to map, so without this it stays blank forever even once the
    // booking has a real ETA.
    {
      const { data: existingRow } = await supabase.from("trucker_invoices").select("tracking_id, month_of_loading").eq("id", targetId).single();
      if (existingRow && !existingRow.month_of_loading && existingRow.tracking_id) {
        const { data: trackingRow } = await supabase.from("tracking").select("eta").eq("id", existingRow.tracking_id).single();
        if (trackingRow?.eta) updates.month_of_loading = trackingRow.eta.slice(0, 10);
      }
    }

    const customCharges: Record<string, number> = {};
    for (const [key] of Object.entries(mapping)) {
      if (key === "booking_number" || key === "container_number" || TRUCKER_INVOICE_BOOKING_CREATE_KEYS.has(key)) continue;
      const raw = get(key);
      if (!raw) continue;
      if (customKeys.includes(key)) {
        customCharges[key] = parseNumeric(raw);
      } else if (TRUCKER_INVOICE_DATE_KEYS.has(key)) {
        const parsed = parseDateish(raw);
        updates[key] = parsed ? parsed.toISOString().slice(0, 10) : null;
      } else if (TRUCKER_INVOICE_NUMERIC_KEYS.has(key)) {
        updates[key] = parseNumeric(raw);
      } else {
        updates[key] = raw;
      }
    }

    if (Object.keys(customCharges).length > 0) {
      const { data: existing } = await supabase.from("trucker_invoices").select("custom_charges").eq("id", targetId).single();
      updates.custom_charges = { ...(existing?.custom_charges ?? {}), ...customCharges };
    }

    if (Object.keys(updates).length === 0 && !wasCreated) {
      skipped.push({ row: sheetRow, reason: "No mapped charge fields had a value" });
      return;
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase.from("trucker_invoices").update(updates).eq("id", targetId);
      if (updateError) {
        skipped.push({ row: sheetRow, reason: updateError.message });
        return;
      }
    }
    imported++;
  }

  // Rows for the SAME booking number must run in order (multi-container
  // bookings rely on each row seeing the previous one's byBooking entry),
  // but rows for DIFFERENT bookings have no such dependency - see the
  // identical comment in the Forwarders import for why this matters for
  // finishing within Vercel's function time limit on a real-sized sheet.
  const groups = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const bookingNumber = (colIndex["booking_number"] !== undefined ? (row[colIndex["booking_number"]] ?? "").trim() : "");
    if (!bookingNumber) {
      skipped.push({ row: i + 2, reason: "Booking Number is blank" });
      continue;
    }
    const key = bookingNumber.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  }

  async function processGroup(indices: number[]) {
    for (const i of indices) {
      await processRow(i);
    }
  }

  const CONCURRENCY = 20;
  const groupList = Array.from(groups.values());
  for (let i = 0; i < groupList.length; i += CONCURRENCY) {
    await Promise.all(groupList.slice(i, i + CONCURRENCY).map(processGroup));
  }

  return NextResponse.json({ imported, total: rows.length, skipped });
}
