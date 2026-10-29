import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import {
  TRUCKER_INVOICE_DATE_KEYS,
  TRUCKER_INVOICE_NUMERIC_KEYS,
  TRUCKER_INVOICE_BOOKING_CREATE_KEYS,
  TRUCKER_INVOICE_TRACKING_KEYS
} from "@/lib/trucker-invoice-import-fields";
import { reserveBookingNos } from "@/lib/booking-number";
import { parseDateish, parseMonthish } from "@/lib/parse-date";

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
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const companyId = me.company_id;

  const body = await req.json();
  const truckerId: string = body.truckerId;
  const headers: string[] = body.headers ?? [];
  const rows: string[][] = body.rows ?? [];
  const mapping: Record<string, string | null> = body.mapping ?? {};
  const customKeys: string[] = body.customKeys ?? [];
  const dryRun: boolean = body.dryRun === true;
  // Keyed by booking_number.toLowerCase() -> "add" (create a genuinely
  // separate booking for this trucker instead of reassigning the
  // existing one) or "ignore" (keep today's behavior: reassign).
  const duplicateResolutions: Record<string, "add" | "ignore"> = body.duplicateResolutions ?? {};
  // See the identical fallback (with full reasoning) on the Forwarders
  // import commit route.
  const defaultYear: number | null = Number.isInteger(body.defaultYear) ? body.defaultYear : null;

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

  // A text-type custom column (a reference/note, not a charge amount)
  // must never go through parseNumeric() - without this, mapping an
  // import column onto one would silently turn real text into 0. A
  // date-type column needs the opposite special case: run through
  // parseDateish() like invoice_date/invoice_due_date, not left as the
  // sheet's raw (possibly Excel-serial) value.
  const textCustomKeys = new Set<string>();
  const dateCustomKeys = new Set<string>();
  if (customKeys.length > 0) {
    const { data: colDefs } = await supabase
      .from("trucker_invoice_custom_columns")
      .select("key, value_type")
      .eq("company_id", companyId)
      .in("key", customKeys);
    for (const c of colDefs ?? []) {
      if (c.value_type === "text") textCustomKeys.add(c.key);
      if (c.value_type === "date") dateCustomKeys.add(c.key);
    }
  }

  const { data: truckerParty } = await supabase.from("parties").select("id").eq("id", truckerId).eq("company_id", companyId).maybeSingle();
  if (!truckerParty) return NextResponse.json({ error: "Trucker not found" }, { status: 404 });

  const [{ data: existingInvoices, error: fetchError }, { data: allBookings, error: bookingsError }] = await Promise.all([
    supabase
      .from("trucker_invoices")
      .select("id, booking_number, container_number, invoice_number")
      .eq("company_id", companyId)
      .eq("trucker_id", truckerId),
    supabase.from("bookings").select("id, carrier_booking_no").eq("company_id", companyId)
  ]);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (bookingsError) return NextResponse.json({ error: bookingsError.message }, { status: 500 });

  // Entries carry invoice_number too (kept current via latestInvoiceNumber
  // below) so a later sheet row for the same booking+container can tell
  // "filling in the same invoice" apart from "this is a separate, later
  // invoice for the same container" - see the matchedCandidate/
  // isSeparateInvoice logic in processRow (ported from the identical fix
  // on the Forwarders import).
  const byBooking = new Map<string, { id: string; container_number: string | null; invoice_number: string | null }[]>();
  for (const inv of existingInvoices ?? []) {
    const key = (inv.booking_number ?? "").toLowerCase();
    if (!byBooking.has(key)) byBooking.set(key, []);
    byBooking.get(key)!.push({ id: inv.id, container_number: inv.container_number, invoice_number: inv.invoice_number });
  }
  const latestInvoiceNumber = new Map<string, string>();

  const bookingIdByNumber = new Map<string, string>();
  for (const b of allBookings ?? []) {
    if (b.carrier_booking_no) bookingIdByNumber.set(b.carrier_booking_no.toLowerCase(), b.id);
  }

  // Which trucker (if any) is currently assigned to each of this
  // company's bookings - used below to tell "reassigning is safe, nothing
  // was there before" apart from "this would silently steal the booking
  // from whoever's actually handling it", which only matters when a
  // booking number gets reused across two genuinely different shipments.
  const bookingIds = (allBookings ?? []).map((b: any) => b.id);
  const currentTruckerByBookingId = new Map<string, { id: string; name: string | null }>();
  if (bookingIds.length > 0) {
    const { data: assignments } = await supabase
      .from("booking_parties")
      .select("booking_id, party_id, parties (legal_name)")
      .in("booking_id", bookingIds)
      .eq("role", "trucker");
    for (const a of (assignments ?? []) as any[]) {
      currentTruckerByBookingId.set(a.booking_id, { id: a.party_id, name: a.parties?.legal_name ?? null });
    }
  }

  // A row only risks "stealing" a booking when (a) this trucker has no
  // invoice for that booking number yet (otherwise it's the normal
  // fill-in-charges path, never reaches the reassignment branch at all)
  // and (b) the booking is currently assigned to a DIFFERENT trucker -
  // no assignment yet means nothing to lose, so that's not flagged.
  const conflictedGroups = new Map<string, { sheetRows: number[]; currentTruckerName: string | null }>();
  {
    const seenRows = new Map<string, number[]>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const bookingNumber = (colIndex["booking_number"] !== undefined ? (row[colIndex["booking_number"]] ?? "").trim() : "");
      if (!bookingNumber) continue;
      const key = bookingNumber.toLowerCase();
      if (!seenRows.has(key)) seenRows.set(key, []);
      seenRows.get(key)!.push(i + 2);
    }
    for (const [key, sheetRows] of seenRows) {
      if (byBooking.has(key)) continue;
      const bookingId = bookingIdByNumber.get(key);
      if (!bookingId) continue;
      const current = currentTruckerByBookingId.get(bookingId);
      if (current && current.id !== truckerId) {
        conflictedGroups.set(key, { sheetRows, currentTruckerName: current.name });
      }
    }
  }

  if (dryRun) {
    const duplicateGroups = Array.from(conflictedGroups.entries()).map(([key, g]) => ({
      carrierBookingNo: rows[g.sheetRows[0] - 2][colIndex["booking_number"]].trim(),
      currentTruckerName: g.currentTruckerName,
      sheetRows: g.sheetRows,
    }));
    return NextResponse.json({ dryRun: true, duplicateGroups });
  }

  // Upper bound: every row could turn out to need a new booking. Unused
  // reserved numbers are simply never written anywhere, so this can't
  // leave a gap - only actually-inserted bookings consume one. Safe to
  // hand out from concurrent rows below: a plain array index increment
  // can't interleave with another one mid-statement in JS.
  const reservedNos = await reserveBookingNos(supabase, rows.length, companyId);
  let reservedIdx = 0;

  const skipped: Skip[] = [];
  let imported = 0;

  async function processRow(i: number) {
    const row = rows[i];
    const sheetRow = i + 2;
    const get = (key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

    const bookingNumber = get("booking_number");
    const containerNumber = get("container_number");

    // See the identical fallback and reasoning on the Forwarders import
    // commit route - resolved once per row and used both for a brand-new
    // booking's own erd AND, unconditionally, as this row's invoice's
    // month_of_loading (including an extra container added to a booking
    // that already existed before this row ran).
    const rowErdRaw = get("erd");
    const rowErd = rowErdRaw
      ? (parseDateish(rowErdRaw) ?? parseMonthish(rowErdRaw, parseDateish(get("invoice_date")) ?? (defaultYear ? new Date(Date.UTC(defaultYear, 0, 1)) : null)))?.toISOString().slice(0, 10) ?? null
      : null;

    const candidates = byBooking.get(bookingNumber.toLowerCase()) ?? [];
    let targetId: string | null = null;
    let wasCreated = false;

    // When a container number is given, only an EXACT container match
    // counts as "already resolved" - see the identical comment in the
    // Forwarders import for why a lone-candidate shortcut is unsafe.
    // .filter().pop() rather than .find() - once a duplicate-invoice clone
    // (below) pushes a second entry for the same container, a later row
    // must compare against the MOST RECENT one, not the first.
    const matchedCandidate = containerNumber
      ? candidates.filter((c) => (c.container_number ?? "").toLowerCase() === containerNumber.toLowerCase()).pop()
      : candidates.length === 1
      ? candidates[0]
      : undefined;

    if (matchedCandidate) {
      // Real statements bill the SAME booking+container more than once
      // over time - those are genuinely separate invoice documents, not a
      // correction to the first. See the identical fix (with full
      // reasoning) on the Forwarders import commit route.
      const rowInvoiceNumber = get("invoice_number");
      const existingInvoiceNumber = (latestInvoiceNumber.get(matchedCandidate.id) ?? matchedCandidate.invoice_number ?? "").trim();
      const isSeparateInvoice = !!rowInvoiceNumber && !!existingInvoiceNumber && rowInvoiceNumber.toLowerCase() !== existingInvoiceNumber.toLowerCase();

      if (isSeparateInvoice) {
        const { data: sourceRow, error: sourceError } = await supabase
          .from("trucker_invoices")
          .select("month_of_loading, location, currency")
          .eq("id", matchedCandidate.id)
          .single();
        if (sourceError || !sourceRow) {
          skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" already has a different invoice, but couldn't read it to start a new one: ${sourceError?.message ?? "not found"}` });
          return;
        }
        const { data: clonedInvoice, error: cloneError } = await supabase
          .from("trucker_invoices")
          .insert({
            company_id: companyId,
            trucker_id: truckerId,
            booking_number: bookingNumber,
            container_number: containerNumber || null,
            // tracking_id deliberately not copied - see the identical note
            // on the Forwarders import commit route (unique constraint on
            // tracking_id; NULL is exempt from it in Postgres).
            ...sourceRow,
          })
          .select("id")
          .single();
        if (cloneError || !clonedInvoice) {
          skipped.push({ row: sheetRow, reason: `Couldn't start a new invoice for booking "${bookingNumber}": ${cloneError?.message ?? "insert failed"}` });
          return;
        }
        targetId = clonedInvoice.id;
        wasCreated = true;
        const key = bookingNumber.toLowerCase();
        byBooking.get(key)!.push({ id: clonedInvoice.id, container_number: containerNumber || null, invoice_number: null });
      } else {
        targetId = matchedCandidate.id;
      }
    } else if (!containerNumber && candidates.length > 1) {
      skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" has multiple containers - map Container Number to disambiguate` });
      return;
    } else if (
      bookingIdByNumber.has(bookingNumber.toLowerCase()) &&
      !(conflictedGroups.has(bookingNumber.toLowerCase()) && duplicateResolutions[bookingNumber.toLowerCase()] === "add")
    ) {
      // The booking exists but this trucker isn't the one assigned to it
      // (or none is) - this invoice sheet is treated as authoritative for
      // who the real trucker is, so link it. (Unless the user explicitly
      // chose "add" after seeing this would reassign a booking away from
      // a different trucker - that falls through to the "doesn't exist"
      // branch below instead, creating a genuinely separate booking.)
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
        const { error: containerError } = await supabase.from("containers").insert({ company_id: companyId, booking_id: existingBookingId, container_no: containerNumber });
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
            company_id: companyId,
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
      byBooking.get(key)!.push({ id: targetId, container_number: containerNumber || null, invoice_number: null });
    } else {
      // Booking Number doesn't exist anywhere, OR it does but the user
      // explicitly chose "add" rather than let this reassign it away from
      // a different trucker - either way, create a (new) booking here.
      wasCreated = true;
      const bookingFields: Record<string, any> = {
        carrier_booking_no: bookingNumber,
        booking_no: reservedNos[reservedIdx++],
        company_id: companyId,
        status: "confirmed"
      };
      for (const key of TRUCKER_INVOICE_BOOKING_CREATE_KEYS) {
        if (key === "erd") {
          if (rowErd) bookingFields.erd = rowErd;
          continue;
        }
        const raw = get(key);
        if (!raw) continue;
        bookingFields[key] = raw;
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
        const { error: containerError } = await supabase.from("containers").insert({ company_id: companyId, booking_id: newBooking.id, container_no: containerNumber });
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
            company_id: companyId,
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
      byBooking.get(key)!.push({ id: targetId, container_number: containerNumber || null, invoice_number: null });
    }

    const updates: Record<string, any> = {};

    // See the identical fix (with full reasoning) on the Forwarders import
    // commit route - applies to every branch (new booking, linked booking,
    // or an extra container on a booking that already existed before this
    // row ran), since sync_container_to_tracking() never copies erd into
    // tracking.eta, so the backfill below never fires for any of them.
    if (rowErd) updates.month_of_loading = rowErd;

    // The booking's own erd must carry this month too, not just the invoice -
    // Booking & Instructions filters bookings by booking.erd and hides any
    // with none, so an import that only set month_of_loading on invoices left
    // the booking invisible there. Backfill only when still null. See the
    // identical fix on the Forwarders import.
    if (rowErd) {
      const bookingId = bookingIdByNumber.get(bookingNumber.toLowerCase());
      if (bookingId) {
        const { data: bk } = await supabase.from("bookings").select("erd").eq("id", bookingId).single();
        if (bk && !bk.erd) {
          await supabase.from("bookings").update({ erd: rowErd }).eq("id", bookingId);
        }
      }
    }

    // ETA and Status (live) live on the invoice's `tracking` row, not on
    // trucker_invoices - collected here and written onto that tracking row
    // below via tracking_id. Same as the Forwarders import.
    const trackingUpdates: Record<string, any> = {};
    if (colIndex["eta"] !== undefined) {
      const etaRaw = get("eta");
      if (etaRaw) {
        const parsedEta = parseDateish(etaRaw) ?? parseMonthish(etaRaw, parseDateish(get("invoice_date")) ?? (defaultYear ? new Date(Date.UTC(defaultYear, 0, 1)) : null));
        if (parsedEta) trackingUpdates.eta = parsedEta.toISOString().slice(0, 10);
      }
    }
    if (colIndex["release_status"] !== undefined) {
      const statusRaw = get("release_status");
      if (statusRaw) {
        trackingUpdates.release_status = statusRaw.trim().toLowerCase() === "released" ? "Released" : "On Water";
      }
    }

    // Read the invoice's tracking link + current month once - used to apply
    // the ETA/Status above and to backfill Month of Loading from the live
    // tracking ETA when the sheet didn't carry one. See the Forwarders import.
    let trackingChanged = false;
    {
      const { data: existingRow } = await supabase.from("trucker_invoices").select("tracking_id, month_of_loading").eq("id", targetId).single();
      const trackingId = existingRow?.tracking_id ?? null;

      if (Object.keys(trackingUpdates).length > 0 && trackingId) {
        const { error: trackingError } = await supabase.from("tracking").update(trackingUpdates).eq("id", trackingId);
        if (!trackingError) trackingChanged = true;
      }

      if (existingRow && !existingRow.month_of_loading && !updates.month_of_loading && trackingId) {
        let eta: string | null = trackingUpdates.eta ?? null;
        if (!eta) {
          const { data: trackingRow } = await supabase.from("tracking").select("eta").eq("id", trackingId).single();
          eta = trackingRow?.eta ?? null;
        }
        if (eta) updates.month_of_loading = String(eta).slice(0, 10);
      }
    }

    const customCharges: Record<string, number | string> = {};
    for (const [key] of Object.entries(mapping)) {
      if (key === "booking_number" || key === "container_number" || TRUCKER_INVOICE_BOOKING_CREATE_KEYS.has(key) || TRUCKER_INVOICE_TRACKING_KEYS.has(key)) continue;
      const raw = get(key);
      if (!raw) continue;
      if (customKeys.includes(key)) {
        if (textCustomKeys.has(key)) {
          customCharges[key] = raw;
        } else if (dateCustomKeys.has(key)) {
          const parsed = parseDateish(raw);
          customCharges[key] = parsed ? parsed.toISOString().slice(0, 10) : "";
        } else {
          customCharges[key] = parseNumeric(raw);
        }
      } else if (TRUCKER_INVOICE_DATE_KEYS.has(key)) {
        const parsed = parseDateish(raw);
        updates[key] = parsed ? parsed.toISOString().slice(0, 10) : null;
      } else if (TRUCKER_INVOICE_NUMERIC_KEYS.has(key)) {
        updates[key] = parseNumeric(raw);
      } else if (key === "paid_status") {
        updates[key] = raw.trim().toUpperCase() === "PAID" ? "PAID" : "UNPAID";
      } else {
        updates[key] = raw;
      }
    }

    if (colIndex["invoice_number"] !== undefined) {
      latestInvoiceNumber.set(targetId!, get("invoice_number") || (latestInvoiceNumber.get(targetId!) ?? ""));
    }

    if (Object.keys(customCharges).length > 0) {
      const { data: existing } = await supabase.from("trucker_invoices").select("custom_charges").eq("id", targetId).single();
      updates.custom_charges = { ...(existing?.custom_charges ?? {}), ...customCharges };
    }

    if (Object.keys(updates).length === 0 && !wasCreated && !trackingChanged) {
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
