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

type Result = { row: number; status: "imported" | "skipped"; reason?: string; booking_number?: string };

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

  const supabase = createServiceClient();
  const bookingNos = await reserveBookingNos(supabase, rows.length);
  const partyCache = new Map<string, string>();
  const results: Result[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRowNumber = i + 2; // +1 for header row, +1 for 1-indexing
    const get = (key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

    const carrierBookingNo = get("carrier_booking_no");
    if (!carrierBookingNo) {
      results.push({ row: sheetRowNumber, status: "skipped", reason: "Booking Number is blank" });
      continue;
    }

    const bookingFields: Record<string, any> = {
      carrier_booking_no: carrierBookingNo,
      company_id: DEFAULT_COMPANY_ID,
      booking_no: bookingNos[i],
      status: "confirmed"
    };
    for (const f of IMPORT_FIELDS) {
      if (f.kind === "party" || f.key === "container_no" || f.key === "carrier_booking_no") continue;
      const raw = get(f.key);
      if (!raw) continue;
      bookingFields[f.key] = f.kind === "date" ? parseDateish(raw) : raw;
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert(bookingFields)
      .select("id")
      .single();

    if (bookingError) {
      const reason =
        bookingError.code === "23505"
          ? `Booking Number "${carrierBookingNo}" already exists`
          : bookingError.message;
      results.push({ row: sheetRowNumber, status: "skipped", reason });
      continue;
    }

    const containerNo = get("container_no");
    if (containerNo) {
      await supabase.from("containers").insert({ booking_id: booking.id, container_no: containerNo });
    }

    for (const f of IMPORT_FIELDS) {
      if (f.kind !== "party") continue;
      const name = get(f.key);
      if (!name) continue;

      const cacheKey = `${f.role}:${name.toLowerCase()}`;
      let partyId = partyCache.get(cacheKey);

      if (!partyId) {
        const { data: existing } = await supabase
          .from("parties")
          .select("id, roles")
          .eq("company_id", DEFAULT_COMPANY_ID)
          .ilike("legal_name", name)
          .maybeSingle();

        if (existing) {
          partyId = existing.id;
          if (!(existing.roles ?? []).includes(f.role)) {
            await supabase.from("parties").update({ roles: [...(existing.roles ?? []), f.role] }).eq("id", existing.id);
          }
        } else {
          const { data: created, error: createError } = await supabase
            .from("parties")
            .insert({ company_id: DEFAULT_COMPANY_ID, legal_name: name, roles: [f.role] })
            .select("id")
            .single();
          if (createError) continue;
          partyId = created.id;
        }
        partyCache.set(cacheKey, partyId!);
      }

      await supabase.from("booking_parties").insert({ booking_id: booking.id, party_id: partyId, role: f.role });
    }

    results.push({ row: sheetRowNumber, status: "imported", booking_number: carrierBookingNo });
  }

  const imported = results.filter((r) => r.status === "imported").length;
  const skipped = results.filter((r) => r.status === "skipped");

  return NextResponse.json({ imported, skipped, total: rows.length });
}
