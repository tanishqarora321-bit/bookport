import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { IMPORT_FIELDS } from "@/lib/booking-import-fields";
import { reserveBookingNos } from "@/lib/booking-number";
import { parseDateish, parseMonthish, rolledForwardDate } from "@/lib/parse-date";

export const maxDuration = 300;

type Skip = { row: number; reason: string };
// A date that doesn't exist (29-02-2026) saved as the next real day - kept,
// but reported on the Done screen instead of changed silently.
type DateFix = { row: number; bookingNumber: string; field: string; from: string; to: string };

// One row's Packing Details, for that row's own container.
type Packing = { seal_no: string | null; weight: number | null; weight_unit: "LBS" | "KG"; bales: number | null };

type Group = {
  carrierBookingNo: string;
  sheetRows: number[];
  fields: Record<string, any>;
  containerNos: string[];
  parties: { role: string; name: string }[];
  // Keyed by container number (lower-cased) - from the row that carried it.
  packing: Map<string, Packing>;
};

// Rewritten from a one-row-at-a-time loop (10+ sequential DB round trips
// PER ROW - forwarder/trucker/supplier/buyer lookups, creates, booking
// insert, container insert) to a handful of bulk operations for the
// whole file. The per-row version worked in testing on a handful of rows
// but timed out for real: a 81-row import meant 800+ sequential round
// trips in one serverless request, which Vercel kills past its function
// time limit - the request never gets to send a JSON error, so the
// browser sees an HTML/plaintext timeout page and throws "Unexpected
// token 'A', An error o... is not valid JSON" trying to parse it as JSON.
//
// Two different "same Booking Number" cases, handled differently:
// 1. The SAME number appears more than once WITHIN this file - almost
//    always just multiple containers of one shipment (one row per
//    container is the natural Excel shape). These get merged into ONE
//    booking with multiple containers, not multiple bookings - silently,
//    no prompt needed. (This used to silently DROP every row after the
//    first with the same number - a real bug, fixed here.)
// 2. The number already exists on an ALREADY-SAVED booking (from a
//    previous import or manual entry). `dryRun: true` reports these
//    without saving anything so the review screen can ask, per number:
//    fill in that booking's missing details from this sheet (the default -
//    re-importing a sheet repairs what an earlier import left blank), add a
//    genuinely separate second entry, or ignore it. The real commit then
//    honors `duplicateResolutions`.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const headers: string[] = body.headers ?? [];
  const rows: string[][] = body.rows ?? [];
  const mapping: Record<string, string | null> = body.mapping ?? {};
  const dryRun: boolean = body.dryRun === true;
  // Keyed by carrier_booking_no.toLowerCase(), for a number already saved:
  // "fill" (the default: fill in that booking's blank fields, missing
  // containers and missing packing details from this sheet - never
  // overwriting anything already there), "add" (a genuinely separate second
  // entry, highlighted as Multiple) or "ignore" (skip it).
  const duplicateResolutions: Record<string, "add" | "ignore" | "fill"> = body.duplicateResolutions ?? {};
  // "Year this sheet applies to", asked on the upload step (like the
  // Forwarders import): a bare month name in a date column ("AUGUST") is
  // read as that month of this year.
  const defaultYear: number | null = Number.isInteger(body.defaultYear) ? body.defaultYear : null;
  // Set only when the user chose, on the "Missing dates" step, to give the
  // bookings that have no ERD and no cut-off at all a Month of Loading
  // ("YYYY-MM-01"). Otherwise they're saved without one and show under
  // every year behind Booking & Instructions' "No ERD" filter.
  const undatedErd: string | null =
    typeof body.undatedErd === "string" && /^\d{4}-\d{2}-01$/.test(body.undatedErd) ? body.undatedErd : null;

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

  const skipped: Skip[] = [];
  const dateFixes: DateFix[] = [];
  // Rows whose packing details couldn't be placed (no container number).
  const notes: Skip[] = [];

  const toNumber = (v: string): number | null => {
    const cleaned = v.replace(/[,\s]/g, "");
    if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
    return Number(cleaned);
  };
  const groupByKey = new Map<string, Group>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRow = i + 2; // +1 for header row, +1 for 1-indexing
    const get = (key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

    const carrierBookingNo = get("carrier_booking_no");
    if (!carrierBookingNo) {
      skipped.push({ row: sheetRow, reason: "Booking Number is blank" });
      continue;
    }

    const containerNo = get("container_no");
    const parties = IMPORT_FIELDS.filter((f) => f.kind === "party")
      .map((f) => ({ role: f.role!, name: get(f.key) }))
      .filter((p) => p.name);

    const key = carrierBookingNo.toLowerCase();
    let group = groupByKey.get(key);
    if (!group) {
      group = {
        carrierBookingNo,
        sheetRows: [],
        fields: { carrier_booking_no: carrierBookingNo, company_id: me.company_id, status: "confirmed" },
        containerNos: [],
        parties: [],
        packing: new Map(),
      };
      groupByKey.set(key, group);
    }
    // Booking-level fields come from the first row of the group that has
    // each one - a multi-container booking often has its dates/ports only
    // on one of its rows, and reading only the first row lost them.
    for (const f of IMPORT_FIELDS) {
      if (f.kind === "party" || f.kind === "packing" || f.key === "container_no" || f.key === "carrier_booking_no") continue;
      if (group.fields[f.key]) continue;
      const raw = get(f.key);
      if (!raw) continue;
      if (f.key === "instruction_status") {
        // "SENT" / "NOT SENT" (any case) -> the grid's two values.
        const v = raw.toLowerCase().replace(/[^a-z]/g, "");
        if (v.startsWith("not")) group.fields.instruction_status = "not_sent";
        else if (v.includes("sent")) group.fields.instruction_status = "sent";
        continue;
      }
      if (f.kind === "date") {
        const d = parseDateish(raw) ?? parseMonthish(raw, defaultYear ? new Date(Date.UTC(defaultYear, 0, 1)) : null);
        if (d) group.fields[f.key] = d.toISOString();
        const fixed = rolledForwardDate(raw);
        if (d && fixed) dateFixes.push({ row: sheetRow, bookingNumber: carrierBookingNo, field: f.label, from: raw, to: fixed });
      } else {
        group.fields[f.key] = raw;
      }
    }
    group.sheetRows.push(sheetRow);
    if (containerNo && !group.containerNos.includes(containerNo)) group.containerNos.push(containerNo);

    // This row's Packing Details belong to this row's container.
    const sealNo = get("seal_no");
    const weight = toNumber(get("weight"));
    const bales = toNumber(get("bales"));
    if (sealNo || weight !== null || bales !== null) {
      if (!containerNo) {
        notes.push({ row: sheetRow, reason: `Packing details for "${carrierBookingNo}" not saved - the row has no Container Number to attach them to` });
      } else if (!group.packing.has(containerNo.toLowerCase())) {
        group.packing.set(containerNo.toLowerCase(), {
          seal_no: sealNo || null,
          weight,
          weight_unit: get("weight_unit").toUpperCase().startsWith("KG") ? "KG" : "LBS",
          bales: bales === null ? null : Math.round(bales),
        });
      }
    }
    for (const p of parties) {
      if (!group.parties.some((existing) => existing.role === p.role)) group.parties.push(p);
    }
  }

  const groups = Array.from(groupByKey.values());

  // No ERD and no cut-off date at all - nothing to file them under a year
  // by. Listed on the dry run so the user can give them a Month of Loading.
  const isUndated = (g: Group) => !g.fields.erd && !g.fields.cargo_cutoff && !g.fields.si_cutoff;
  if (undatedErd) {
    for (const g of groups) if (isUndated(g)) g.fields.erd = new Date(`${undatedErd}T00:00:00Z`).toISOString();
  }

  if (groups.length === 0) {
    return NextResponse.json({ imported: 0, updated: 0, total: rows.length, skipped, dateFixes, notes });
  }

  const supabase = createServiceClient();

  // Business-level duplicate check against already-saved bookings -
  // carrier_booking_no has no uniqueness constraint (migration 0031
  // deliberately removed it), so this is the only thing that catches it.
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("carrier_booking_no")
    .eq("company_id", me.company_id)
    .in("carrier_booking_no", groups.map((g) => g.carrierBookingNo));
  const existingSet = new Set((existingBookings ?? []).map((b: any) => (b.carrier_booking_no ?? "").toLowerCase()));

  if (dryRun) {
    const duplicateGroups = groups
      .filter((g) => existingSet.has(g.carrierBookingNo.toLowerCase()))
      .map((g) => ({
        carrierBookingNo: g.carrierBookingNo,
        containerCount: g.containerNos.length || 1,
        sheetRows: g.sheetRows,
      }));
    const undatedGroups = groups
      .filter(isUndated)
      .map((g) => ({ carrierBookingNo: g.carrierBookingNo, containerCount: g.containerNos.length || 1, sheetRows: g.sheetRows }));
    return NextResponse.json({ dryRun: true, duplicateGroups, undatedGroups, dateFixes });
  }

  const toInsert: Group[] = [];
  const toFill: Group[] = [];
  for (const g of groups) {
    const key = g.carrierBookingNo.toLowerCase();
    if (!existingSet.has(key)) toInsert.push(g);
    else if (duplicateResolutions[key] === "add") toInsert.push(g);
    else if ((duplicateResolutions[key] ?? "fill") === "fill") toFill.push(g);
    else for (const sheetRow of g.sheetRows) skipped.push({ row: sheetRow, reason: `Booking Number "${g.carrierBookingNo}" already exists - ignored` });
  }

  if (toInsert.length === 0 && toFill.length === 0) {
    return NextResponse.json({ imported: 0, updated: 0, total: rows.length, skipped, dateFixes, notes });
  }

  // Parties: this company's whole party list once (dozens, not thousands);
  // names the sheet uses that don't exist yet are created, and an existing
  // party gets any role it's newly seen in.
  const partyByName = new Map<string, { id: string; roles: string[] }>();
  if ([...toInsert, ...toFill].some((g) => g.parties.length > 0)) {
    const { data: allParties } = await supabase.from("parties").select("id, legal_name, roles").eq("company_id", me.company_id);
    for (const p of allParties ?? []) partyByName.set(p.legal_name.toLowerCase(), { id: p.id, roles: p.roles ?? [] });

    const nameOriginal = new Map<string, string>();
    const rolesNeededByName = new Map<string, Set<string>>();
    for (const g of [...toInsert, ...toFill]) {
      for (const p of g.parties) {
        const key = p.name.toLowerCase();
        nameOriginal.set(key, p.name);
        if (!rolesNeededByName.has(key)) rolesNeededByName.set(key, new Set());
        rolesNeededByName.get(key)!.add(p.role);
      }
    }
    const toCreate = Array.from(rolesNeededByName.entries())
      .filter(([key]) => !partyByName.has(key))
      .map(([key, roles]) => ({ company_id: me.company_id, legal_name: nameOriginal.get(key)!, roles: Array.from(roles) }));
    if (toCreate.length > 0) {
      const { data: created } = await supabase.from("parties").insert(toCreate).select("id, legal_name, roles");
      for (const p of created ?? []) partyByName.set(p.legal_name.toLowerCase(), { id: p.id, roles: p.roles ?? [] });
    }
    for (const [key, roles] of rolesNeededByName) {
      const existing = partyByName.get(key);
      if (!existing) continue;
      const missing = Array.from(roles).filter((r) => !existing.roles.includes(r));
      if (missing.length === 0) continue;
      const newRoles = [...existing.roles, ...missing];
      await supabase.from("parties").update({ roles: newRoles }).eq("id", existing.id);
      existing.roles = newRoles;
    }
  }

  // Packing Details rows for these containers, from the sheet.
  function packingRowsFor(g: Group, containers: { id: string; container_no: string | null }[]) {
    const out: Record<string, any>[] = [];
    for (const c of containers) {
      const p = c.container_no ? g.packing.get(c.container_no.toLowerCase()) : undefined;
      if (p) out.push({ container_id: c.id, ...p, sort_order: 0 });
    }
    return out;
  }

  let imported = 0;

  // ---------------- New bookings ----------------
  if (toInsert.length > 0) {
    // 1 round trip: bulk-insert every booking in the file at once.
    const bookingNos = await reserveBookingNos(supabase, toInsert.length, me.company_id);
    const insertPayload = toInsert.map((g, idx) => ({ ...g.fields, booking_no: bookingNos[idx] }));
    const { data: insertedBookings, error: insertError } = await supabase
      .from("bookings")
      .insert(insertPayload)
      .select("id, carrier_booking_no");

    if (insertError || !insertedBookings) {
      // The app-level dedupe check above already filters out anything that
      // collides with an existing booking (unless the user chose "add") -
      // this would only fire from a genuine race.
      const reason = insertError?.message ?? "insert failed";
      for (const g of toInsert) for (const sheetRow of g.sheetRows) skipped.push({ row: sheetRow, reason });
    } else {
      const bookingIdByKey = new Map(toInsert.map((g, idx) => [g.carrierBookingNo.toLowerCase(), insertedBookings[idx].id]));

      // 1 round trip: every booking_parties link at once.
      const bookingPartyRows: { booking_id: string; party_id: string; role: string }[] = [];
      for (const g of toInsert) {
        const bookingId = bookingIdByKey.get(g.carrierBookingNo.toLowerCase())!;
        for (const p of g.parties) {
          const party = partyByName.get(p.name.toLowerCase());
          if (party) bookingPartyRows.push({ booking_id: bookingId, party_id: party.id, role: p.role });
        }
      }
      if (bookingPartyRows.length > 0) await supabase.from("booking_parties").insert(bookingPartyRows);

      // Containers are inserted LAST, after booking_parties - a container
      // insert fires sync_container_to_tracking() (migration 0015 onward),
      // which reads the booking's parties off booking_parties AT THAT
      // MOMENT to create their pending invoices. One row per distinct
      // container number in the group: same Booking Number on 3 rows = 1
      // booking with 3 containers.
      const containerRows = toInsert.flatMap((g) => {
        const bookingId = bookingIdByKey.get(g.carrierBookingNo.toLowerCase());
        return g.containerNos.map((container_no) => ({ company_id: me.company_id, booking_id: bookingId, container_no }));
      });
      if (containerRows.length > 0) {
        const { data: insertedContainers } = await supabase.from("containers").insert(containerRows).select("id, booking_id, container_no");
        const packingRows: Record<string, any>[] = [];
        for (const g of toInsert) {
          const bookingId = bookingIdByKey.get(g.carrierBookingNo.toLowerCase());
          packingRows.push(...packingRowsFor(g, (insertedContainers ?? []).filter((c: any) => c.booking_id === bookingId)));
        }
        if (packingRows.length > 0) {
          const { error: packingError } = await supabase.from("container_packing_items").insert(packingRows);
          if (packingError) notes.push({ row: 0, reason: `Bookings were saved, but their packing details failed: ${packingError.message}` });
        }
      }

      imported = toInsert.reduce((sum, g) => sum + g.sheetRows.length, 0);
    }
  }

  // ---------------- Existing bookings: fill in what's missing ----------------
  // Re-importing a sheet fills the blanks on bookings already saved (dates,
  // ports, line, Instruction Status, unassigned parties, missing containers,
  // containers with no packing details yet) - it never overwrites a value
  // that's already there. Same-number bookings: the most recent one.
  let updated = 0;
  if (toFill.length > 0) {
    const { data: existingFull } = await supabase
      .from("bookings")
      .select("id, carrier_booking_no, created_at, erd, si_cutoff, cargo_cutoff, pol, pod, final_destination, bl_issued_at, carrier, vessel, instruction_status")
      .eq("company_id", me.company_id)
      .in("carrier_booking_no", toFill.map((g) => g.carrierBookingNo))
      .order("created_at", { ascending: false });
    const latestByKey = new Map<string, any>();
    for (const b of existingFull ?? []) {
      const key = (b.carrier_booking_no ?? "").toLowerCase();
      if (!latestByKey.has(key)) latestByKey.set(key, b);
    }

    const companyId = me.company_id;
    const FILLABLE = ["erd", "si_cutoff", "cargo_cutoff", "pol", "pod", "final_destination", "bl_issued_at", "carrier", "vessel", "instruction_status"];

    async function fillOne(g: Group) {
      const b = latestByKey.get(g.carrierBookingNo.toLowerCase());
      if (!b) {
        for (const sheetRow of g.sheetRows) skipped.push({ row: sheetRow, reason: `Booking "${g.carrierBookingNo}" couldn't be found to fill in` });
        return;
      }

      const patch: Record<string, any> = {};
      for (const k of FILLABLE) if (!b[k] && g.fields[k]) patch[k] = g.fields[k];
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("bookings").update(patch).eq("id", b.id).eq("company_id", companyId);
        if (error) {
          for (const sheetRow of g.sheetRows) skipped.push({ row: sheetRow, reason: `Couldn't fill in booking "${g.carrierBookingNo}": ${error.message}` });
          return;
        }
      }

      // Parties the booking doesn't have yet (an assigned one is never replaced).
      if (g.parties.length > 0) {
        const { data: assigned } = await supabase.from("booking_parties").select("role").eq("booking_id", b.id);
        const have = new Set((assigned ?? []).map((a: any) => a.role));
        const links = g.parties
          .filter((p) => !have.has(p.role))
          .map((p) => ({ booking_id: b.id, party_id: partyByName.get(p.name.toLowerCase())?.id, role: p.role }))
          .filter((l) => l.party_id);
        if (links.length > 0) await supabase.from("booking_parties").insert(links);
      }

      // Containers the booking doesn't have yet, then packing details for
      // any of its containers that have none.
      const { data: haveContainers } = await supabase.from("containers").select("id, container_no").eq("booking_id", b.id);
      const haveNos = new Set((haveContainers ?? []).map((c: any) => (c.container_no ?? "").toLowerCase()));
      const newNos = g.containerNos.filter((no) => !haveNos.has(no.toLowerCase()));
      let allContainers = (haveContainers ?? []) as { id: string; container_no: string | null }[];
      if (newNos.length > 0) {
        const { data: added } = await supabase
          .from("containers")
          .insert(newNos.map((container_no) => ({ company_id: companyId, booking_id: b.id, container_no })))
          .select("id, container_no");
        allContainers = [...allContainers, ...((added ?? []) as any[])];
      } else if (g.parties.length > 0) {
        // Re-fire the tracking/invoice sync for newly assigned parties.
        for (const c of haveContainers ?? []) {
          if (c.container_no) await supabase.from("containers").update({ container_no: c.container_no }).eq("id", c.id);
        }
      }
      if (allContainers.length > 0 && g.packing.size > 0) {
        const { data: withPacking } = await supabase
          .from("container_packing_items")
          .select("container_id")
          .in("container_id", allContainers.map((c) => c.id));
        const packed = new Set((withPacking ?? []).map((p: any) => p.container_id));
        const rowsToAdd = packingRowsFor(g, allContainers.filter((c) => !packed.has(c.id)));
        if (rowsToAdd.length > 0) await supabase.from("container_packing_items").insert(rowsToAdd);
      }

      updated += g.sheetRows.length;
    }

    // Different bookings are independent - a few at a time keeps a large
    // re-import inside the serverless time limit.
    const CONCURRENCY = 10;
    for (let i = 0; i < toFill.length; i += CONCURRENCY) {
      await Promise.all(toFill.slice(i, i + CONCURRENCY).map(fillOne));
    }
  }

  return NextResponse.json({ imported, updated, total: rows.length, skipped, dateFixes, notes });
}
