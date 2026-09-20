import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import { IMPORT_FIELDS } from "@/lib/booking-import-fields";

export const maxDuration = 60;

function parseDateish(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Same BP-YY-NNNN sequence as app/api/bookings/route.ts's nextBookingNo,
// but reserves a whole block up front so a batch import doesn't make one
// count() round trip per row.
async function reserveBookingNos(supabase: any, count: number): Promise<string[]> {
  const year = new Date().getFullYear().toString().slice(-2);
  const { count: existing } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .like("booking_no", `BP-${year}-%`);
  const start = existing ?? 0;
  return Array.from({ length: count }, (_, i) => `BP-${year}-${String(start + i + 1).padStart(4, "0")}`);
}

type Skip = { row: number; reason: string };

// Rewritten from a one-row-at-a-time loop (10+ sequential DB round trips
// PER ROW - forwarder/trucker/supplier/buyer lookups, creates, booking
// insert, container insert) to a handful of bulk operations for the
// whole file. The per-row version worked in testing on a handful of rows
// but timed out for real: a 81-row import meant 800+ sequential round
// trips in one serverless request, which Vercel kills past its function
// time limit - the request never gets to send a JSON error, so the
// browser sees an HTML/plaintext timeout page and throws "Unexpected
// token 'A', An error o... is not valid JSON" trying to parse it as JSON.
// carrier_booking_no has no DB-level unique constraint (checked
// supabase/migrations/0002_extraction_fields.sql - it's a plain text
// column), so duplicate detection has to happen here, not via a 23505
// conflict from Postgres.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const headers: string[] = body.headers ?? [];
  const rows: string[][] = body.rows ?? [];
  const mapping: Record<string, string | null> = body.mapping ?? {};

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }

  const colIndex: Record<string, number> = {};
  for (const [key, headerName] of Object.entries(mapping)) {
    if (!headerName) continue;
    const idx = headers.indexOf(headerName);
    if (idx !== -1) colIndex[key] = idx;
  }

  if (colIndex["carrier_booking_no"] === undefined) {
    return NextResponse.json({ error: "Booking Number must be mapped to a column before importing." }, { status: 400 });
  }

  type Candidate = {
    sheetRow: number;
    carrierBookingNo: string;
    fields: Record<string, any>;
    containerNo: string;
    parties: { role: string; name: string }[];
  };

  const skipped: Skip[] = [];
  const seenInFile = new Set<string>();
  const candidates: Candidate[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRow = i + 2; // +1 for header row, +1 for 1-indexing
    const get = (key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

    const carrierBookingNo = get("carrier_booking_no");
    if (!carrierBookingNo) {
      skipped.push({ row: sheetRow, reason: "Booking Number is blank" });
      continue;
    }
    if (seenInFile.has(carrierBookingNo.toLowerCase())) {
      skipped.push({ row: sheetRow, reason: `Duplicate Booking Number "${carrierBookingNo}" earlier in this file` });
      continue;
    }
    seenInFile.add(carrierBookingNo.toLowerCase());

    const fields: Record<string, any> = {
      carrier_booking_no: carrierBookingNo,
      company_id: DEFAULT_COMPANY_ID,
      status: "confirmed"
    };
    for (const f of IMPORT_FIELDS) {
      if (f.kind === "party" || f.key === "container_no" || f.key === "carrier_booking_no") continue;
      const raw = get(f.key);
      if (!raw) continue;
      fields[f.key] = f.kind === "date" ? parseDateish(raw) : raw;
    }

    const parties = IMPORT_FIELDS.filter((f) => f.kind === "party")
      .map((f) => ({ role: f.role!, name: get(f.key) }))
      .filter((p) => p.name);

    candidates.push({ sheetRow, carrierBookingNo, fields, containerNo: get("container_no"), parties });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ imported: 0, total: rows.length, skipped });
  }

  const supabase = createServiceClient();

  // Business-level duplicate check against already-imported bookings -
  // carrier_booking_no has no DB uniqueness constraint, so this is the
  // only thing that catches it.
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("carrier_booking_no")
    .in("carrier_booking_no", candidates.map((c) => c.carrierBookingNo));
  const existingSet = new Set((existingBookings ?? []).map((b: any) => (b.carrier_booking_no ?? "").toLowerCase()));

  const toInsert = candidates.filter((c) => {
    if (existingSet.has(c.carrierBookingNo.toLowerCase())) {
      skipped.push({ row: c.sheetRow, reason: `Booking Number "${c.carrierBookingNo}" already exists` });
      return false;
    }
    return true;
  });

  if (toInsert.length === 0) {
    return NextResponse.json({ imported: 0, total: rows.length, skipped });
  }

  // 1 round trip: bulk-insert every booking in the file at once.
  const bookingNos = await reserveBookingNos(supabase, toInsert.length);
  const insertPayload = toInsert.map((c, idx) => ({ ...c.fields, booking_no: bookingNos[idx] }));
  const { data: insertedBookings, error: insertError } = await supabase
    .from("bookings")
    .insert(insertPayload)
    .select("id, carrier_booking_no");

  if (insertError) {
    // The app-level dedupe check above already filters out anything that
    // collides with an existing or in-file booking number - this 23505
    // would only fire from a genuine race (another import/manual entry
    // landing between that check and this insert), which is rare enough
    // not to warrant re-running the whole batch row-by-row to isolate it.
    const reason =
      insertError.code === "23505"
        ? "A Booking Number in this batch was just created elsewhere - re-upload the file to retry."
        : insertError.message;
    for (const c of toInsert) skipped.push({ row: c.sheetRow, reason });
    return NextResponse.json({ imported: 0, total: rows.length, skipped });
  }

  // Booking-number uniqueness is enforced per company (migration 0014),
  // but map by array position here regardless, since it's simpler and
  // avoids relying on that constraint for correctness of this mapping.
  const bookingIdByRow = new Map(toInsert.map((c, idx) => [c.sheetRow, insertedBookings[idx].id]));

  // 1 round trip: bulk-insert every container in the file at once.
  const containerRows = toInsert
    .filter((c) => c.containerNo)
    .map((c) => ({ booking_id: bookingIdByRow.get(c.sheetRow), container_no: c.containerNo }));
  if (containerRows.length > 0) {
    await supabase.from("containers").insert(containerRows);
  }

  // Parties: fetch this company's whole party list once (typically dozens,
  // not thousands) instead of one lookup per row per role.
  const anyParties = toInsert.some((c) => c.parties.length > 0);
  if (anyParties) {
    const { data: allParties } = await supabase
      .from("parties")
      .select("id, legal_name, roles")
      .eq("company_id", DEFAULT_COMPANY_ID);

    const partyByName = new Map<string, { id: string; roles: string[] }>();
    for (const p of allParties ?? []) partyByName.set(p.legal_name.toLowerCase(), { id: p.id, roles: p.roles ?? [] });

    const nameOriginal = new Map<string, string>();
    const rolesNeededByName = new Map<string, Set<string>>();
    for (const c of toInsert) {
      for (const p of c.parties) {
        const key = p.name.toLowerCase();
        nameOriginal.set(key, p.name);
        if (!rolesNeededByName.has(key)) rolesNeededByName.set(key, new Set());
        rolesNeededByName.get(key)!.add(p.role);
      }
    }

    const toCreate = Array.from(rolesNeededByName.entries())
      .filter(([key]) => !partyByName.has(key))
      .map(([key, roles]) => ({
        company_id: DEFAULT_COMPANY_ID,
        legal_name: nameOriginal.get(key)!,
        roles: Array.from(roles)
      }));

    if (toCreate.length > 0) {
      const { data: created } = await supabase.from("parties").insert(toCreate).select("id, legal_name, roles");
      for (const p of created ?? []) partyByName.set(p.legal_name.toLowerCase(), { id: p.id, roles: p.roles ?? [] });
    }

    // Existing parties that need an extra role added (e.g. a party
    // already used as a Buyer is now also seen as a Forwarder).
    for (const [key, roles] of rolesNeededByName) {
      const existing = partyByName.get(key);
      if (!existing) continue;
      const missing = Array.from(roles).filter((r) => !existing.roles.includes(r));
      if (missing.length === 0) continue;
      const newRoles = [...existing.roles, ...missing];
      await supabase.from("parties").update({ roles: newRoles }).eq("id", existing.id);
      existing.roles = newRoles;
    }

    // 1 round trip: bulk-insert every booking_parties link at once.
    const bookingPartyRows: { booking_id: string; party_id: string; role: string }[] = [];
    for (const c of toInsert) {
      const bookingId = bookingIdByRow.get(c.sheetRow)!;
      for (const p of c.parties) {
        const party = partyByName.get(p.name.toLowerCase());
        if (party) bookingPartyRows.push({ booking_id: bookingId, party_id: party.id, role: p.role });
      }
    }
    if (bookingPartyRows.length > 0) {
      await supabase.from("booking_parties").insert(bookingPartyRows);
    }
  }

  return NextResponse.json({ imported: toInsert.length, total: rows.length, skipped });
}
