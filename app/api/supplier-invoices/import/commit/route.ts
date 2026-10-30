import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { SUPPLIER_INVOICE_DATE_KEYS, SUPPLIER_INVOICE_HEADER_KEYS } from "@/lib/supplier-invoice-import-fields";
import { reserveBookingNos } from "@/lib/booking-number";
import { parseDateish, parseMonthish } from "@/lib/parse-date";

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
// One invoice in the sheet: its first row (the one carrying the Booking
// Number) plus the cost-line rows under it. `header` holds each
// SUPPLIER_INVOICE_HEADER_KEYS value, taken from whichever row of the
// group first has one.
type Group = { startRow: number; rowIndices: number[]; bookingNumber: string; header: Record<string, string> };

// A supplier statement is one invoice spread across several rows: a row
// with a Booking Number starts a new invoice, and every row under it
// with a BLANK Booking Number is that invoice's next cost-section line
// (Description/Weight/Unit Price/Amount), until the next non-blank
// Booking Number starts the next invoice.
//
// Each invoice is matched by Booking Number + Container Number, in any
// year - the same match-or-assign rule as the Forwarders/Truckers imports
// (app/api/trucker-invoices/import/commit/route.ts, which this follows):
// - this supplier already has an invoice for that booking+container ->
//   fill it in (a differing Invoice Number instead adds a separate,
//   later invoice for the same container);
// - the booking exists but this supplier isn't on it -> assign the
//   supplier (adding the container if it's missing), then fill in the
//   pending invoice that creates;
// - the booking exists nowhere -> create it, in the year the user picked
//   on the client's "New bookings" step, with the supplier assigned.
// A booking currently assigned to a DIFFERENT supplier is only reassigned
// once the user has confirmed it on the "Duplicates" step (dry run).
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
  const dryRun: boolean = body.dryRun === true;
  // Keyed by booking_number.toLowerCase() -> "add" (create a genuinely
  // separate booking for this supplier) or "ignore" (reassign the existing
  // one to this supplier).
  const duplicateResolutions: Record<string, "add" | "ignore"> = body.duplicateResolutions ?? {};
  // Fallback year for a bare month name ("JANUARY") on a booking that
  // already exists - see the Forwarders import commit route.
  const defaultYear: number | null = Number.isInteger(body.defaultYear) ? body.defaultYear : null;
  // The year picked on the "New bookings" step - see the Truckers import.
  const newBookingYear: number | null = Number.isInteger(body.newBookingYear) ? body.newBookingYear : null;

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
      current = { startRow: sheetRow, rowIndices: [i], bookingNumber, header: {} };
      groups.push(current);
    } else if (current) {
      current.rowIndices.push(i);
    } else {
      skipped.push({ row: sheetRow, reason: "No Booking Number on this row or any row above it to attach this line to" });
    }
  }

  for (const g of groups) {
    for (const key of SUPPLIER_INVOICE_HEADER_KEYS) {
      for (const i of g.rowIndices) {
        const raw = get(rows[i], key);
        if (raw) {
          g.header[key] = raw;
          break;
        }
      }
    }
  }

  if (groups.length === 0) {
    if (dryRun) return NextResponse.json({ dryRun: true, duplicateGroups: [], newBookingGroups: [] });
    return NextResponse.json({ imported: 0, total: 0, skipped });
  }

  const [{ data: existingInvoices, error: fetchError }, { data: allBookings, error: bookingsError }] = await Promise.all([
    supabase
      .from("supplier_invoices")
      .select("id, booking_number, container_number, invoice_number")
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId),
    supabase.from("bookings").select("id, carrier_booking_no, erd").eq("company_id", companyId),
  ]);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (bookingsError) return NextResponse.json({ error: bookingsError.message }, { status: 500 });

  // This supplier's invoices per booking number. invoice_number is kept
  // current as the import runs (latestInvoiceNumber) so a later group for
  // the same booking+container can tell "the same invoice again" from "a
  // separate, later invoice for the same container".
  const byBooking = new Map<string, { id: string; container_number: string | null; invoice_number: string | null }[]>();
  for (const inv of existingInvoices ?? []) {
    const key = (inv.booking_number ?? "").toLowerCase();
    if (!byBooking.has(key)) byBooking.set(key, []);
    byBooking.get(key)!.push({ id: inv.id, container_number: inv.container_number, invoice_number: inv.invoice_number });
  }
  const latestInvoiceNumber = new Map<string, string>();

  const bookingIdByNumber = new Map<string, string>();
  // Each booking's own Month of Loading (ERD) - the year a bare month name
  // on the sheet ("MARCH") belongs to, and the invoice's Month of Loading
  // when the sheet gives none. Kept current as bookings are created/backfilled.
  const bookingErdByNumber = new Map<string, string>();
  for (const b of allBookings ?? []) {
    if (!b.carrier_booking_no) continue;
    bookingIdByNumber.set(b.carrier_booking_no.toLowerCase(), b.id);
    if (b.erd) bookingErdByNumber.set(b.carrier_booking_no.toLowerCase(), String(b.erd).slice(0, 10));
  }

  const bookingIds = (allBookings ?? []).map((b: any) => b.id);
  const currentSupplierByBookingId = new Map<string, { id: string; name: string | null }>();
  if (bookingIds.length > 0) {
    const { data: assignments } = await supabase
      .from("booking_parties")
      .select("booking_id, party_id, parties (legal_name)")
      .in("booking_id", bookingIds)
      .eq("role", "supplier");
    for (const a of (assignments ?? []) as any[]) {
      currentSupplierByBookingId.set(a.booking_id, { id: a.party_id, name: a.parties?.legal_name ?? null });
    }
  }

  const groupsByBooking = new Map<string, Group[]>();
  for (const g of groups) {
    const key = g.bookingNumber.toLowerCase();
    if (!groupsByBooking.has(key)) groupsByBooking.set(key, []);
    groupsByBooking.get(key)!.push(g);
  }

  // Booking numbers that would reassign a booking away from a different
  // supplier (needs the user's say-so), and ones that exist in no year at
  // all (need a year) - see the Truckers import for the same split.
  const conflictedGroups = new Map<string, { currentSupplierName: string | null }>();
  const unknownKeys = new Set<string>();
  for (const key of groupsByBooking.keys()) {
    if (byBooking.has(key)) continue;
    const bookingId = bookingIdByNumber.get(key);
    if (!bookingId) {
      unknownKeys.add(key);
      continue;
    }
    const cur = currentSupplierByBookingId.get(bookingId);
    if (cur && cur.id !== supplierId) conflictedGroups.set(key, { currentSupplierName: cur.name });
  }

  const newBookingKeys = new Set<string>(unknownKeys);
  for (const key of conflictedGroups.keys()) {
    if (duplicateResolutions[key] === "add") newBookingKeys.add(key);
  }

  // Month (0-11) and day for a new booking's ERD - from the invoice's own
  // Month of Loading, else its Invoice Date, else its ETA. The year is
  // never taken from here; it's the one the user picked.
  function groupMonthDay(g: Group): { month: number; day: number } | null {
    for (const key of ["erd", "invoice_date", "eta"]) {
      const raw = g.header[key];
      if (!raw) continue;
      const d = parseDateish(raw) ?? parseMonthish(raw, new Date(Date.UTC(2000, 0, 1)));
      if (d) return { month: d.getUTCMonth(), day: key === "erd" ? d.getUTCDate() : 1 };
    }
    return null;
  }

  // A new booking with no month anywhere still needs SOME erd or it's
  // invisible on Booking & Instructions - borrow the month from another
  // invoice of the same booking, else January.
  function newBookingErd(g: Group, year: number): string {
    let md = groupMonthDay(g);
    if (!md) {
      for (const other of groupsByBooking.get(g.bookingNumber.toLowerCase()) ?? []) {
        md = groupMonthDay(other);
        if (md) break;
      }
    }
    const { month, day } = md ?? { month: 0, day: 1 };
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
  }

  function bookingSummary(key: string) {
    const gs = groupsByBooking.get(key) ?? [];
    const containers = new Set<string>();
    let month: number | null = null;
    for (const g of gs) {
      if (g.header["container_number"]) containers.add(g.header["container_number"].toUpperCase());
      if (month === null) month = groupMonthDay(g)?.month ?? null;
    }
    return {
      carrierBookingNo: gs[0].bookingNumber,
      sheetRows: gs.map((g) => g.startRow),
      containers: Array.from(containers),
      month,
    };
  }

  if (dryRun) {
    const duplicateGroups = Array.from(conflictedGroups.entries()).map(([key, c]) => ({
      ...bookingSummary(key),
      currentSupplierName: c.currentSupplierName,
    }));
    const newBookingGroups = Array.from(unknownKeys).map(bookingSummary);
    return NextResponse.json({ dryRun: true, duplicateGroups, newBookingGroups });
  }

  const reservedNos = await reserveBookingNos(supabase, groupsByBooking.size, companyId);
  let reservedIdx = 0;

  let imported = 0;
  let bookingsCreated = 0;

  // The newest invoice this supplier has for booking+container (container
  // null when the sheet gave none), or - when the database trigger left
  // none, which has been seen live for containers that already existed
  // from another party's import - one created directly here, linked to
  // the container's live tracking row when that isn't already taken.
  async function findOrCreateShell(bookingNumber: string, containerNumber: string): Promise<{ id: string } | { error: string }> {
    let q = supabase.from("supplier_invoices").select("id").eq("supplier_id", supplierId).eq("booking_number", bookingNumber);
    q = containerNumber ? q.eq("container_number", containerNumber) : q.is("container_number", null);
    const { data: found } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (found) return { id: found.id };

    let trackingId: string | null = null;
    if (containerNumber) {
      const { data: trk } = await supabase
        .from("tracking")
        .select("id")
        .eq("company_id", companyId)
        .eq("booking_number", bookingNumber)
        .eq("container_number", containerNumber)
        .limit(1)
        .maybeSingle();
      trackingId = trk?.id ?? null;
      if (trackingId) {
        const { data: taken } = await supabase.from("supplier_invoices").select("id").eq("tracking_id", trackingId).limit(1).maybeSingle();
        if (taken) trackingId = null;
      }
    }
    const { data: created, error } = await supabase
      .from("supplier_invoices")
      .insert({ company_id: companyId, supplier_id: supplierId, tracking_id: trackingId, booking_number: bookingNumber, container_number: containerNumber || null, currency, fx_rate: fxRate })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "insert failed" };
    return { id: created.id };
  }

  async function processGroup(g: Group) {
    const { bookingNumber, header } = g;
    const key = bookingNumber.toLowerCase();
    const containerNumber = header["container_number"] || "";

    const isNewBooking = newBookingKeys.has(key);
    // A bare month name belongs to the booking's own year when it already
    // has one (so re-importing never moves an invoice into another year),
    // else the invoice date's, else the picked / working year.
    const knownErd = isNewBooking ? null : bookingErdByNumber.get(key) ?? null;
    const yearFallback = isNewBooking && newBookingYear ? newBookingYear : defaultYear;
    const monthRef: Date | null =
      (knownErd ? new Date(`${knownErd}T00:00:00Z`) : null) ??
      (header["invoice_date"] ? parseDateish(header["invoice_date"]) : null) ??
      (yearFallback ? new Date(Date.UTC(yearFallback, 0, 1)) : null);
    const erdRaw = header["erd"];
    const rowErd = isNewBooking && newBookingYear
      ? newBookingErd(g, newBookingYear)
      : erdRaw
      ? (parseDateish(erdRaw) ?? parseMonthish(erdRaw, monthRef))?.toISOString().slice(0, 10) ?? null
      : null;

    const candidates = byBooking.get(key) ?? [];
    let targetId: string | null = null;

    // When a container number is given only an EXACT container match
    // counts. Among this supplier's invoices for that booking+container,
    // prefer the one with the SAME Invoice Number (re-importing a statement
    // must land on the invoices it created last time, not copy them again),
    // then a still-pending one (no number yet). Only when every existing
    // one carries a different number is this a separate, later invoice.
    const sameContainer = containerNumber
      ? candidates.filter((c) => (c.container_number ?? "").toLowerCase() === containerNumber.toLowerCase())
      : candidates.length === 1
      ? candidates
      : [];
    const newInvoiceNumber = (header["invoice_number"] || "").trim().toLowerCase();
    const numberOf = (c: { id: string; invoice_number: string | null }) => (latestInvoiceNumber.get(c.id) ?? c.invoice_number ?? "").trim().toLowerCase();
    const matchedCandidate =
      (newInvoiceNumber ? sameContainer.find((c) => numberOf(c) === newInvoiceNumber) : undefined) ??
      sameContainer.find((c) => !numberOf(c)) ??
      (newInvoiceNumber ? undefined : sameContainer[sameContainer.length - 1]);

    if (matchedCandidate) {
      targetId = matchedCandidate.id;
    } else if (sameContainer.length > 0) {
      // A later, separate invoice for the same booking+container - its
      // own row, tracking_id left null (one invoice per tracking row; the
      // first one already holds it).
      const { data: sourceRow } = await supabase
        .from("supplier_invoices")
        .select("month_of_loading, forwarder_name, consignee_name")
        .eq("id", sameContainer[0].id)
        .single();
      const { data: cloned, error: cloneError } = await supabase
        .from("supplier_invoices")
        .insert({
          company_id: companyId,
          supplier_id: supplierId,
          booking_number: bookingNumber,
          container_number: containerNumber || null,
          ...(sourceRow ?? {}),
        })
        .select("id")
        .single();
      if (cloneError || !cloned) {
        skipped.push({ row: g.startRow, reason: `Couldn't start a new invoice for booking "${bookingNumber}": ${cloneError?.message ?? "insert failed"}` });
        return;
      }
      targetId = cloned.id;
      byBooking.get(key)!.push({ id: cloned.id, container_number: containerNumber || null, invoice_number: null });
    } else if (!containerNumber && candidates.length > 1) {
      skipped.push({ row: g.startRow, reason: `Booking "${bookingNumber}" has multiple containers - map Container Number to tell them apart` });
      return;
    } else if (bookingIdByNumber.has(key) && !(conflictedGroups.has(key) && duplicateResolutions[key] === "add")) {
      // The booking exists (any year) - assign this supplier to it rather
      // than create a duplicate booking.
      const existingBookingId = bookingIdByNumber.get(key)!;

      const { error: unassignError } = await supabase.from("booking_parties").delete().eq("booking_id", existingBookingId).eq("role", "supplier");
      if (unassignError) {
        skipped.push({ row: g.startRow, reason: `Couldn't link supplier to booking "${bookingNumber}": ${unassignError.message}` });
        return;
      }
      const { error: assignError } = await supabase.from("booking_parties").insert({ booking_id: existingBookingId, party_id: supplierId, role: "supplier" });
      if (assignError) {
        skipped.push({ row: g.startRow, reason: `Couldn't link supplier to booking "${bookingNumber}": ${assignError.message}` });
        return;
      }

      // Adding the container (or re-touching the existing ones) fires
      // sync_container_to_tracking(), which creates this supplier's
      // pending invoice per container (migration 0021).
      const { data: existingContainers } = await supabase
        .from("containers")
        .select("id, container_no")
        .eq("booking_id", existingBookingId)
        .not("container_no", "is", null);
      const matchingContainer = containerNumber
        ? (existingContainers ?? []).find((c: { container_no: string | null }) => (c.container_no ?? "").toLowerCase() === containerNumber.toLowerCase())
        : null;
      if (containerNumber && !matchingContainer) {
        const { error: containerError } = await supabase.from("containers").insert({ company_id: companyId, booking_id: existingBookingId, container_no: containerNumber });
        if (containerError) {
          skipped.push({ row: g.startRow, reason: `Supplier linked to "${bookingNumber}", but adding the container failed: ${containerError.message}` });
          return;
        }
      } else {
        for (const c of existingContainers ?? []) {
          await supabase.from("containers").update({ container_no: c.container_no }).eq("id", c.id);
        }
      }

      const shell = await findOrCreateShell(bookingNumber, containerNumber);
      if ("error" in shell) {
        skipped.push({ row: g.startRow, reason: `Supplier linked to "${bookingNumber}", but couldn't create its invoice: ${shell.error}` });
        return;
      }
      targetId = shell.id;
      if (!byBooking.has(key)) byBooking.set(key, []);
      byBooking.get(key)!.push({ id: targetId, container_number: containerNumber || null, invoice_number: null });
    } else {
      // Exists nowhere (or the user chose "add" over reassigning it away
      // from a different supplier) - create the booking.
      const bookingFields: Record<string, any> = {
        carrier_booking_no: bookingNumber,
        booking_no: reservedNos[reservedIdx++],
        company_id: companyId,
        status: "confirmed",
      };
      if (rowErd) bookingFields.erd = rowErd;
      const { data: newBooking, error: bookingError } = await supabase.from("bookings").insert(bookingFields).select("id").single();
      if (bookingError || !newBooking) {
        skipped.push({ row: g.startRow, reason: `Couldn't create booking "${bookingNumber}": ${bookingError?.message ?? "insert failed"}` });
        return;
      }
      bookingIdByNumber.set(key, newBooking.id);
      if (rowErd) bookingErdByNumber.set(key, rowErd);
      bookingsCreated++;

      const { error: bpError } = await supabase.from("booking_parties").insert({ booking_id: newBooking.id, party_id: supplierId, role: "supplier" });
      if (bpError) {
        skipped.push({ row: g.startRow, reason: `Booking "${bookingNumber}" created, but couldn't assign this supplier: ${bpError.message}` });
        return;
      }
      if (containerNumber) {
        const { error: containerError } = await supabase.from("containers").insert({ company_id: companyId, booking_id: newBooking.id, container_no: containerNumber });
        if (containerError) {
          skipped.push({ row: g.startRow, reason: `Booking "${bookingNumber}" created, but adding the container failed: ${containerError.message}` });
          return;
        }
      }
      const shell = await findOrCreateShell(bookingNumber, containerNumber);
      if ("error" in shell) {
        skipped.push({ row: g.startRow, reason: `Booking "${bookingNumber}" created, but couldn't create its invoice: ${shell.error}` });
        return;
      }
      targetId = shell.id;
      if (!byBooking.has(key)) byBooking.set(key, []);
      byBooking.get(key)!.push({ id: targetId, container_number: containerNumber || null, invoice_number: null });
    }

    // ---- Fill in the invoice ----
    const updates: Record<string, any> = { currency, fx_rate: fxRate };
    if (header["forwarder_name"]) updates.forwarder_name = header["forwarder_name"];
    if (header["consignee_name"]) updates.consignee_name = header["consignee_name"];
    if (header["invoice_number"]) updates.invoice_number = header["invoice_number"];
    for (const dateKey of SUPPLIER_INVOICE_DATE_KEYS) {
      const parsed = header[dateKey] ? parseDateish(header[dateKey]) : null;
      if (parsed) updates[dateKey] = parsed.toISOString().slice(0, 10);
    }
    if (header["paid_status"]) updates.paid_status = header["paid_status"].trim().toUpperCase() === "PAID" ? "PAID" : "UNPAID";
    if (rowErd) updates.month_of_loading = rowErd;
    if (header["invoice_number"]) latestInvoiceNumber.set(targetId!, header["invoice_number"]);

    // The booking's own erd must carry the month too - Booking &
    // Instructions hides bookings with none. Backfilled only when null.
    if (rowErd) {
      const bookingId = bookingIdByNumber.get(key);
      if (bookingId) {
        const { data: bk } = await supabase.from("bookings").select("erd").eq("id", bookingId).single();
        if (bk && !bk.erd) {
          await supabase.from("bookings").update({ erd: rowErd }).eq("id", bookingId);
          bookingErdByNumber.set(key, rowErd);
        }
      }
    }

    const trackingUpdates: Record<string, any> = {};
    if (header["eta"]) {
      const parsedEta = parseDateish(header["eta"]) ?? parseMonthish(header["eta"], monthRef);
      if (parsedEta) trackingUpdates.eta = parsedEta.toISOString().slice(0, 10);
    }
    if (header["release_status"]) {
      trackingUpdates.release_status = header["release_status"].trim().toLowerCase() === "released" ? "Released" : "On Water";
    }

    const { data: existingRow } = await supabase
      .from("supplier_invoices")
      .select("tracking_id, month_of_loading, forwarder_name, consignee_name")
      .eq("id", targetId)
      .single();
    const trackingId: string | null = existingRow?.tracking_id ?? null;

    // No month on the sheet or the invoice yet -> the booking's own.
    if (!updates.month_of_loading && !existingRow?.month_of_loading && bookingErdByNumber.get(key)) {
      updates.month_of_loading = bookingErdByNumber.get(key);
    }

    if (trackingId) {
      if (Object.keys(trackingUpdates).length > 0) {
        await supabase.from("tracking").update(trackingUpdates).eq("id", trackingId);
      }
      // Fill whatever the sheet and the invoice both lack from the live
      // tracking row: Month of Loading from its ETA, Forwarder/Consignee
      // from its parties - never overwriting a value already there.
      const needMonth = !updates.month_of_loading && !existingRow?.month_of_loading;
      const needFwd = !updates.forwarder_name && !existingRow?.forwarder_name;
      const needCons = !updates.consignee_name && !existingRow?.consignee_name;
      if (needMonth || needFwd || needCons) {
        const { data: trk } = await supabase.from("tracking").select("eta, party_id, forwarder_id").eq("id", trackingId).single();
        if (trk) {
          if (needMonth && (trackingUpdates.eta ?? trk.eta)) updates.month_of_loading = String(trackingUpdates.eta ?? trk.eta).slice(0, 10);
          const [{ data: party }, { data: fwd }] = await Promise.all([
            needCons && trk.party_id ? supabase.from("parties").select("legal_name").eq("id", trk.party_id).single() : Promise.resolve({ data: null as any }),
            needFwd && trk.forwarder_id ? supabase.from("parties").select("legal_name").eq("id", trk.forwarder_id).single() : Promise.resolve({ data: null as any }),
          ]);
          if (party?.legal_name) updates.consignee_name = party.legal_name;
          if (fwd?.legal_name) updates.forwarder_name = fwd.legal_name;
        }
      }
    }

    updates.updated_at = new Date().toISOString();
    const { error: updateError } = await supabase.from("supplier_invoices").update(updates).eq("id", targetId);
    if (updateError) {
      skipped.push({ row: g.startRow, reason: `Couldn't fill in the invoice for booking "${bookingNumber}": ${updateError.message}` });
      return;
    }

    // Cost lines: the sheet's lines REPLACE whatever the invoice had, so
    // re-importing the same statement never doubles its charges. An
    // invoice row with no cost lines leaves existing ones alone.
    const items = g.rowIndices
      .map((i, idx) => {
        const row = rows[i];
        const description = get(row, "description");
        const weight = parseNumeric(get(row, "weight_kg"));
        const price = parseNumeric(get(row, "unit_price"));
        const amount = parseNumeric(get(row, "amount"));
        if (!description && weight === null && price === null && amount === null) return null;
        return {
          supplier_invoice_id: targetId,
          description: description || null,
          weight_kg: weight,
          unit_price: price,
          amount: defaultAmount(weight, price, amount),
          sort_order: idx,
        };
      })
      .filter((it): it is NonNullable<typeof it> => it !== null);

    if (items.length > 0) {
      const { error: clearError } = await supabase.from("supplier_invoice_items").delete().eq("supplier_invoice_id", targetId);
      const { error: itemsError } = clearError ? { error: clearError } : await supabase.from("supplier_invoice_items").insert(items);
      if (itemsError) {
        skipped.push({ row: g.startRow, reason: `Invoice for booking "${bookingNumber}" filled in, but its cost lines failed: ${itemsError.message}` });
        return;
      }
    }

    imported++;
  }

  // Invoices for the SAME booking run in sheet order (each must see the
  // previous one's booking/invoice); different bookings run concurrently
  // so a real-sized statement finishes inside Vercel's time limit.
  async function processBooking(gs: Group[]) {
    for (const g of gs) await processGroup(g);
  }
  const bookingList = Array.from(groupsByBooking.values());
  const CONCURRENCY = 20;
  for (let i = 0; i < bookingList.length; i += CONCURRENCY) {
    await Promise.all(bookingList.slice(i, i + CONCURRENCY).map(processBooking));
  }

  return NextResponse.json({ imported, total: groups.length, skipped, bookingsCreated, newBookingYear });
}
