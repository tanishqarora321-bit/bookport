import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { BUYER_INVOICE_CHARGE_LINES } from "@/lib/buyer-invoice-import-fields";
import { reserveBookingNos } from "@/lib/booking-number";
import { fillBookingBlanks, monthOfLoadingFor, normalizeContainerColumn } from "@/lib/import-booking-fields";
import { fillTrackingBlanks } from "@/lib/tracking-master";
import { parseDateish, parseMonthish } from "@/lib/parse-date";

export const maxDuration = 300;

function parseNumeric(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
}

type Skip = { row: number; reason: string };

// Supabase caps one select at 1000 rows.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

// Buyer account-statement import - the same model as the Forwarders /
// Truckers / Suppliers imports (2026-11):
//   - every row is matched by Booking Number + Container Number in ANY year
//     (a row with no Booking Number finds it through its Container Number);
//   - a matched booking gets this buyer assigned (when another buyer is on
//     it, the user decides first on the Duplicates step) and the row fills
//     that container's buyer invoice - the same invoice number / a pending
//     one first, a genuinely different invoice number becomes a separate
//     invoice;
//   - a booking number found nowhere is created (with this buyer), in the
//     year picked on the "New bookings" step;
//   - booking-level values (Month of Loading, Shipping Line, POL, POD, Port
//     of Delivery) only fill blanks in Booking & Instructions; ETA / Status
//     only fill blanks on Shipment Tracking;
//   - Invoice Value / Freight / Trucking / Commission become Cost section
//     lines; re-importing replaces those lines instead of doubling them.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const companyId = me.company_id;

  const body = await req.json();
  const buyerId: string = body.buyerId;
  const headers: string[] = body.headers ?? [];
  const rows: string[][] = body.rows ?? [];
  const mapping: Record<string, string | null> = body.mapping ?? {};
  const dryRun: boolean = body.dryRun === true;
  const duplicateResolutions: Record<string, "add" | "ignore"> = body.duplicateResolutions ?? {};
  const defaultYear: number | null = Number.isInteger(body.defaultYear) ? body.defaultYear : null;
  const newBookingYear: number | null = Number.isInteger(body.newBookingYear) ? body.newBookingYear : null;

  if (!buyerId) return NextResponse.json({ error: "buyerId is required" }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: "No rows to import" }, { status: 400 });

  const colIndex: Record<string, number> = {};
  for (const [key, headerName] of Object.entries(mapping)) {
    if (!headerName) continue;
    const idx = headers.indexOf(headerName);
    if (idx !== -1) colIndex[key] = idx;
  }
  // "FFAU 1761558" / "\tGESU6385326" -> FFAU1761558 / GESU6385326.
  normalizeContainerColumn(rows, colIndex);
  if (colIndex["booking_number"] === undefined && colIndex["container_number"] === undefined) {
    return NextResponse.json({ error: "Map Booking Number (or at least Container Number) before importing." }, { status: 400 });
  }
  const cell = (row: string[], key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

  const supabase = createServiceClient();
  const { data: buyerParty } = await supabase.from("parties").select("id").eq("id", buyerId).eq("company_id", companyId).maybeSingle();
  if (!buyerParty) return NextResponse.json({ error: "Buyer not found" }, { status: 404 });

  let existingInvoices: { id: string; booking_number: string | null; container_number: string | null; invoice_number: string | null }[];
  let allBookings: { id: string; carrier_booking_no: string | null; erd: string | null }[];
  let allContainers: { container_no: string | null; booking_id: string }[];
  try {
    [existingInvoices, allBookings, allContainers] = await Promise.all([
      fetchAll<any>((f, t) => supabase.from("buyer_invoices").select("id, booking_number, container_number, invoice_number").eq("company_id", companyId).eq("buyer_id", buyerId).order("id").range(f, t)),
      fetchAll<any>((f, t) => supabase.from("bookings").select("id, carrier_booking_no, erd").eq("company_id", companyId).order("id").range(f, t)),
      fetchAll<any>((f, t) => supabase.from("containers").select("container_no, booking_id").eq("company_id", companyId).not("container_no", "is", null).order("id").range(f, t)),
    ]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const byBooking = new Map<string, { id: string; container_number: string | null; invoice_number: string | null }[]>();
  for (const inv of existingInvoices) {
    const key = (inv.booking_number ?? "").toLowerCase();
    if (!byBooking.has(key)) byBooking.set(key, []);
    byBooking.get(key)!.push({ id: inv.id, container_number: inv.container_number, invoice_number: inv.invoice_number });
  }
  const latestInvoiceNumber = new Map<string, string>();

  const bookingIdByNumber = new Map<string, string>();
  const bookingErdByNumber = new Map<string, string>();
  const bookingNumberById = new Map<string, string>();
  for (const b of allBookings) {
    if (!b.carrier_booking_no) continue;
    bookingIdByNumber.set(b.carrier_booking_no.toLowerCase(), b.id);
    bookingNumberById.set(b.id, b.carrier_booking_no);
    if (b.erd) bookingErdByNumber.set(b.carrier_booking_no.toLowerCase(), String(b.erd).slice(0, 10));
  }
  // A buyer statement often has no Booking Number - its Container Number
  // finds the booking instead.
  const bookingNoByContainer = new Map<string, string>();
  for (const c of allContainers) {
    const no = bookingNumberById.get(c.booking_id);
    if (c.container_no && no) bookingNoByContainer.set(c.container_no.toLowerCase(), no);
  }
  const bookingOf = (row: string[]) => cell(row, "booking_number") || bookingNoByContainer.get(cell(row, "container_number").toLowerCase()) || "";

  // Which buyer each booking has now.
  const currentBuyerByBookingId = new Map<string, { id: string; name: string | null }>();
  {
    const ids = allBookings.map((b) => b.id);
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await supabase.from("booking_parties").select("booking_id, party_id, parties (legal_name)").in("booking_id", ids.slice(i, i + 500)).eq("role", "buyer");
      for (const a of (data ?? []) as any[]) currentBuyerByBookingId.set(a.booking_id, { id: a.party_id, name: a.parties?.legal_name ?? null });
    }
  }

  const conflictedGroups = new Map<string, { sheetRows: number[]; currentBuyerName: string | null }>();
  const unknownKeys = new Set<string>();
  const seenRows = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const bookingNumber = bookingOf(rows[i]);
    if (!bookingNumber) continue;
    const key = bookingNumber.toLowerCase();
    if (!seenRows.has(key)) seenRows.set(key, []);
    seenRows.get(key)!.push(i + 2);
  }
  for (const [key, sheetRows] of seenRows) {
    if (byBooking.has(key)) continue;
    const bookingId = bookingIdByNumber.get(key);
    if (!bookingId) {
      unknownKeys.add(key);
      continue;
    }
    const current = currentBuyerByBookingId.get(bookingId);
    if (current && current.id !== buyerId) conflictedGroups.set(key, { sheetRows, currentBuyerName: current.name });
  }
  const newBookingKeys = new Set<string>(unknownKeys);
  for (const key of conflictedGroups.keys()) if (duplicateResolutions[key] === "add") newBookingKeys.add(key);

  function rowMonthDay(row: string[]): { month: number; day: number } | null {
    for (const key of ["erd", "invoice_date", "eta"]) {
      const raw = cell(row, key);
      if (!raw) continue;
      const d = parseDateish(raw) ?? parseMonthish(raw, new Date(Date.UTC(2000, 0, 1)));
      if (d) return { month: d.getUTCMonth(), day: key === "erd" ? d.getUTCDate() : 1 };
    }
    return null;
  }
  function newBookingErd(key: string, row: string[], year: number): string {
    let md = rowMonthDay(row);
    if (!md) {
      for (const r of seenRows.get(key) ?? []) {
        md = rowMonthDay(rows[r - 2]);
        if (md) break;
      }
    }
    const { month, day } = md ?? { month: 0, day: 1 };
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
  }
  function newBookingSummary(key: string) {
    const sheetRows = seenRows.get(key) ?? [];
    const containers = new Set<string>();
    let month: number | null = null;
    let dateYear: number | null = null;
    for (const r of sheetRows) {
      const row = rows[r - 2];
      const c = cell(row, "container_number");
      if (c) containers.add(c.toUpperCase());
      if (month === null) month = rowMonthDay(row)?.month ?? null;
      // The year the sheet's own full dates fall in - pre-selected on the
      // New bookings step (a 2025 statement isn't filed under 2026).
      for (const k of ["invoice_date", "erd"]) {
        const fullDate: Date | null = dateYear === null && cell(row, k) ? parseDateish(cell(row, k)) : null;
        if (fullDate) dateYear = fullDate.getUTCFullYear();
      }
    }
    return { carrierBookingNo: bookingOf(rows[sheetRows[0] - 2]), sheetRows, containers: Array.from(containers), month, dateYear };
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      duplicateGroups: Array.from(conflictedGroups.entries()).map(([key, g]) => ({ ...newBookingSummary(key), currentBuyerName: g.currentBuyerName })),
      newBookingGroups: Array.from(unknownKeys).map(newBookingSummary),
    });
  }

  const reservedNos = await reserveBookingNos(supabase, rows.length, companyId);
  let reservedIdx = 0;
  const skipped: Skip[] = [];
  let imported = 0;
  let bookingsCreated = 0;

  // The buyer invoice for this booking+container, creating it when the sync
  // trigger left none (linked to the container's tracking row when free).
  async function findOrCreateInvoice(bookingNumber: string, containerNumber: string): Promise<{ id: string } | { error: string }> {
    let q = supabase.from("buyer_invoices").select("id").eq("buyer_id", buyerId).eq("booking_number", bookingNumber);
    q = containerNumber ? q.eq("container_number", containerNumber) : q.is("container_number", null);
    const { data: found } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (found) return { id: found.id };
    let trackingId: string | null = null;
    if (containerNumber) {
      const { data: trk } = await supabase.from("tracking").select("id").eq("company_id", companyId).eq("booking_number", bookingNumber).eq("container_number", containerNumber).limit(1).maybeSingle();
      trackingId = trk?.id ?? null;
      if (trackingId) {
        const { data: taken } = await supabase.from("buyer_invoices").select("id").eq("tracking_id", trackingId).limit(1).maybeSingle();
        if (taken) trackingId = null;
      }
    }
    const { data: created, error } = await supabase
      .from("buyer_invoices")
      .insert({ company_id: companyId, buyer_id: buyerId, tracking_id: trackingId, booking_number: bookingNumber, container_number: containerNumber || null })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "insert failed" };
    return { id: created.id };
  }

  async function processRow(i: number) {
    const row = rows[i];
    const sheetRow = i + 2;
    const get = (key: string) => cell(row, key);
    const bookingNumber = bookingOf(row);
    const containerNumber = get("container_number");
    const key = bookingNumber.toLowerCase();

    const isNewBooking = newBookingKeys.has(key);
    const knownErd = isNewBooking ? null : bookingErdByNumber.get(key) ?? null;
    const rowErdRaw = get("erd");
    const rowErd =
      isNewBooking && newBookingYear
        ? newBookingErd(key, row, newBookingYear)
        : rowErdRaw
        ? (parseDateish(rowErdRaw) ??
            parseMonthish(rowErdRaw, (knownErd ? new Date(`${knownErd}T00:00:00Z`) : null) ?? parseDateish(get("invoice_date")) ?? (defaultYear ? new Date(Date.UTC(defaultYear, 0, 1)) : null)))
            ?.toISOString()
            .slice(0, 10) ?? null
        : null;

    const candidates = byBooking.get(key) ?? [];
    let targetId: string | null = null;
    let wasCreated = false;

    const sameContainer = containerNumber
      ? candidates.filter((c) => (c.container_number ?? "").toLowerCase() === containerNumber.toLowerCase())
      : candidates.length === 1
      ? candidates
      : [];
    const rowInvoiceNumber = get("invoice_number");
    const numberOf = (c: { id: string; invoice_number: string | null }) => (latestInvoiceNumber.get(c.id) ?? c.invoice_number ?? "").trim().toLowerCase();
    const sameNumber = rowInvoiceNumber ? sameContainer.find((c) => numberOf(c) === rowInvoiceNumber.toLowerCase()) : undefined;
    const pending = sameContainer.find((c) => !numberOf(c));
    const matchedCandidate = sameNumber ?? pending ?? sameContainer[sameContainer.length - 1];

    if (matchedCandidate) {
      if (!sameNumber && !pending && !!rowInvoiceNumber) {
        // A genuinely different invoice for the same container -> its own row.
        const { data: src } = await supabase.from("buyer_invoices").select("location, month_of_loading, bl_date, forwarder_name, weight, weight_unit, currency").eq("id", matchedCandidate.id).single();
        const { data: clone, error } = await supabase
          .from("buyer_invoices")
          .insert({ company_id: companyId, buyer_id: buyerId, booking_number: bookingNumber, container_number: containerNumber || null, ...(src ?? {}) })
          .select("id")
          .single();
        if (error || !clone) {
          skipped.push({ row: sheetRow, reason: `Couldn't start a new invoice for booking "${bookingNumber}": ${error?.message ?? "insert failed"}` });
          return;
        }
        targetId = clone.id;
        wasCreated = true;
        candidates.push({ id: clone.id, container_number: containerNumber || null, invoice_number: null });
        byBooking.set(key, candidates);
      } else {
        targetId = matchedCandidate.id;
      }
    } else if (!containerNumber && candidates.length > 1) {
      skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" has multiple containers - map Container Number to tell them apart` });
      return;
    } else if (bookingIdByNumber.has(key) && !(conflictedGroups.has(key) && duplicateResolutions[key] === "add")) {
      // Existing booking: assign this buyer (replacing whoever was on it,
      // as confirmed on the Duplicates step) and fill its container's invoice.
      const bookingId = bookingIdByNumber.get(key)!;
      const { error: delErr } = await supabase.from("booking_parties").delete().eq("booking_id", bookingId).eq("role", "buyer");
      const { error: insErr } = delErr ? { error: delErr } : await supabase.from("booking_parties").insert({ booking_id: bookingId, party_id: buyerId, role: "buyer" });
      if (insErr) {
        skipped.push({ row: sheetRow, reason: `Couldn't assign this buyer to booking "${bookingNumber}": ${insErr.message}` });
        return;
      }
      const { data: containers } = await supabase.from("containers").select("id, container_no").eq("booking_id", bookingId).not("container_no", "is", null);
      const has = containerNumber ? (containers ?? []).some((c: any) => (c.container_no ?? "").toLowerCase() === containerNumber.toLowerCase()) : true;
      if (containerNumber && !has) {
        const { error } = await supabase.from("containers").insert({ company_id: companyId, booking_id: bookingId, container_no: containerNumber });
        if (error) {
          skipped.push({ row: sheetRow, reason: `Buyer assigned to "${bookingNumber}", but adding the container failed: ${error.message}` });
          return;
        }
      } else {
        // Re-fires the sync trigger, which creates / moves the buyer invoices.
        for (const c of containers ?? []) await supabase.from("containers").update({ container_no: c.container_no }).eq("id", c.id);
      }
      const inv = await findOrCreateInvoice(bookingNumber, containerNumber);
      if ("error" in inv) {
        skipped.push({ row: sheetRow, reason: `Buyer assigned to "${bookingNumber}", but couldn't create its invoice: ${inv.error}` });
        return;
      }
      targetId = inv.id;
      wasCreated = true;
      candidates.push({ id: inv.id, container_number: containerNumber || null, invoice_number: null });
      byBooking.set(key, candidates);
    } else {
      // Found nowhere (or "add as separate booking") -> create it.
      wasCreated = true;
      const bookingFields: Record<string, any> = { carrier_booking_no: bookingNumber, booking_no: reservedNos[reservedIdx++], company_id: companyId, status: "confirmed" };
      if (rowErd) bookingFields.erd = rowErd;
      for (const k of ["carrier", "pol", "pod", "final_destination"]) if (get(k)) bookingFields[k] = get(k);
      const { data: nb, error: bErr } = await supabase.from("bookings").insert(bookingFields).select("id").single();
      if (bErr || !nb) {
        skipped.push({ row: sheetRow, reason: `Couldn't create booking "${bookingNumber}": ${bErr?.message ?? "insert failed"}` });
        return;
      }
      bookingIdByNumber.set(key, nb.id);
      if (rowErd) bookingErdByNumber.set(key, rowErd);
      bookingsCreated++;
      const { error: bpErr } = await supabase.from("booking_parties").insert({ booking_id: nb.id, party_id: buyerId, role: "buyer" });
      if (bpErr) {
        skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" created, but couldn't assign this buyer: ${bpErr.message}` });
        return;
      }
      if (containerNumber) {
        const { error } = await supabase.from("containers").insert({ company_id: companyId, booking_id: nb.id, container_no: containerNumber });
        if (error) {
          skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" created, but adding the container failed: ${error.message}` });
          return;
        }
      }
      const inv = await findOrCreateInvoice(bookingNumber, containerNumber);
      if ("error" in inv) {
        skipped.push({ row: sheetRow, reason: `Booking "${bookingNumber}" created, but couldn't create its invoice: ${inv.error}` });
        return;
      }
      targetId = inv.id;
      candidates.push({ id: inv.id, container_number: containerNumber || null, invoice_number: null });
      byBooking.set(key, candidates);
    }

    // ---- Booking values: fill only blanks in Booking & Instructions ----
    const bookingId = bookingIdByNumber.get(key);
    if (bookingId) {
      const filled = await fillBookingBlanks(supabase, bookingId, { erd: rowErd, carrier: get("carrier"), pol: get("pol"), pod: get("pod"), final_destination: get("final_destination") });
      if (filled.erd) bookingErdByNumber.set(key, filled.erd);
    }

    // ---- The invoice header ----
    const updates: Record<string, any> = {};
    // Month of Loading: Booking & Instructions' ERD wins, else the sheet's.
    {
      const mol = await monthOfLoadingFor(supabase, bookingId, rowErd);
      if (mol) updates.month_of_loading = mol;
    }
    if (get("location")) updates.location = get("location");
    if (rowInvoiceNumber) updates.invoice_number = rowInvoiceNumber;
    for (const k of ["invoice_date", "bl_date", "due_date"]) {
      const d = get(k) ? parseDateish(get(k)) : null;
      if (d) updates[k] = d.toISOString().slice(0, 10);
    }
    const weightRaw = get("weight");
    const weight = parseNumeric(weightRaw);
    if (weight !== null) {
      updates.weight = weight;
      updates.weight_unit = /kg/i.test(weightRaw) ? "KG" : "LBS";
    }
    if (get("currency")) updates.currency = get("currency").toUpperCase().replace("$", "USD").replace("€", "EUR").replace("₹", "INR");
    if (get("paid_status")) updates.paid_status = get("paid_status").toUpperCase() === "PAID" ? "PAID" : "UNPAID";
    if (rowInvoiceNumber) latestInvoiceNumber.set(targetId!, rowInvoiceNumber);

    // ---- ETA / Status: fill only blanks on Shipment Tracking ----
    let trackingChanged = false;
    const { data: invRow } = await supabase.from("buyer_invoices").select("tracking_id, month_of_loading").eq("id", targetId).single();
    const trackingId = invRow?.tracking_id ?? null;
    const trackingUpdates: Record<string, string> = {};
    if (get("eta")) {
      const year = isNewBooking && newBookingYear ? newBookingYear : defaultYear;
      const eta = parseDateish(get("eta")) ?? parseMonthish(get("eta"), parseDateish(get("invoice_date")) ?? (year ? new Date(Date.UTC(year, 0, 1)) : null));
      if (eta) trackingUpdates.eta = eta.toISOString().slice(0, 10);
    }
    if (get("release_status")) trackingUpdates.release_status = get("release_status").toLowerCase() === "released" ? "Released" : "On Water";
    if (trackingId && Object.keys(trackingUpdates).length > 0) {
      const { applied } = await fillTrackingBlanks(supabase, trackingId, trackingUpdates);
      trackingChanged = Object.keys(applied).length > 0;
    }
    // No month on the sheet or the invoice yet -> the booking's own ERD,
    // else the container's ETA.
    if (invRow && !invRow.month_of_loading && !updates.month_of_loading) {
      const erd = bookingErdByNumber.get(key);
      if (erd) updates.month_of_loading = erd;
      else if (trackingId) {
        const { data: trk } = await supabase.from("tracking").select("eta").eq("id", trackingId).single();
        if (trk?.eta) updates.month_of_loading = String(trk.eta).slice(0, 10);
      }
    }

    // ---- Cost section lines from the charge columns (replaced, not doubled) ----
    const lines = BUYER_INVOICE_CHARGE_LINES.map((c) => ({ ...c, amount: parseNumeric(get(c.key)) })).filter((c) => c.amount !== null && c.amount !== 0);
    if (lines.length > 0) {
      const { error: delErr } = await supabase.from("buyer_invoice_items").delete().eq("buyer_invoice_id", targetId).in("description", lines.map((l) => l.description));
      const { data: existing } = await supabase.from("buyer_invoice_items").select("sort_order").eq("buyer_invoice_id", targetId);
      const start = Math.max(-1, ...(existing ?? []).map((e: any) => e.sort_order ?? 0)) + 1;
      const { error: insErr } = delErr
        ? { error: delErr }
        : await supabase.from("buyer_invoice_items").insert(lines.map((l, idx) => ({ buyer_invoice_id: targetId, description: l.description, weight_kg: null, unit_price: null, amount: l.amount, sort_order: start + idx })));
      if (insErr) {
        skipped.push({ row: sheetRow, reason: `Invoice for "${bookingNumber}" updated, but its cost lines failed: ${insErr.message}` });
        return;
      }
    }

    if (Object.keys(updates).length === 0 && lines.length === 0 && !wasCreated && !trackingChanged) {
      skipped.push({ row: sheetRow, reason: "No mapped field had a value" });
      return;
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase.from("buyer_invoices").update(updates).eq("id", targetId);
      if (error) {
        skipped.push({ row: sheetRow, reason: error.message });
        return;
      }
    }
    imported++;
  }

  // Same booking -> in order; different bookings -> concurrently (time limit).
  const groups = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const bookingNumber = bookingOf(rows[i]);
    if (!bookingNumber) {
      skipped.push({
        row: i + 2,
        reason: cell(rows[i], "container_number")
          ? `No Booking Number, and container "${cell(rows[i], "container_number")}" isn't on any booking yet`
          : "Booking Number is blank",
      });
      continue;
    }
    const key = bookingNumber.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  }
  const groupList = Array.from(groups.values());
  for (let i = 0; i < groupList.length; i += 20) {
    await Promise.all(groupList.slice(i, i + 20).map(async (idx) => { for (const r of idx) await processRow(r); }));
  }

  return NextResponse.json({ imported, total: rows.length, skipped, bookingsCreated, newBookingYear });
}
