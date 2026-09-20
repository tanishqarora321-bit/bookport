import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

export const maxDuration = 60;

const VALID_ROLES = ["forwarder", "trucker", "supplier", "buyer"];

type Skip = { row: number; reason: string };

// Bulk import for any party role (Forwarders/Truckers/Suppliers/Buyers
// are all `parties` rows differing only by their `roles` array - see
// components/PartyPickerCell.tsx). A name that already exists gets the
// new role merged onto it rather than creating a second party row for
// the same company - mirrors the find-or-create behavior
// app/api/bookings/import/commit/route.ts already uses for the
// Forwarder/Trucker/Supplier/Buyer columns on a booking import.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const headers: string[] = body.headers ?? [];
  const rows: string[][] = body.rows ?? [];
  const mapping: Record<string, string | null> = body.mapping ?? {};
  const role: string = body.role;

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of ${VALID_ROLES.join(", ")}` }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }

  const colIndex: Record<string, number> = {};
  for (const [key, headerName] of Object.entries(mapping)) {
    if (!headerName) continue;
    const idx = headers.indexOf(headerName);
    if (idx !== -1) colIndex[key] = idx;
  }

  if (colIndex["legal_name"] === undefined) {
    return NextResponse.json({ error: "Name must be mapped to a column before importing." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const skipped: Skip[] = [];
  const seenInFile = new Set<string>();

  type Candidate = { sheetRow: number; name: string; short_code: string; country: string; address: string };
  const candidates: Candidate[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRow = i + 2;
    const get = (key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

    const name = get("legal_name");
    if (!name) {
      skipped.push({ row: sheetRow, reason: "Name is blank" });
      continue;
    }
    if (seenInFile.has(name.toLowerCase())) {
      skipped.push({ row: sheetRow, reason: `Duplicate "${name}" earlier in this file` });
      continue;
    }
    seenInFile.add(name.toLowerCase());
    candidates.push({ sheetRow, name, short_code: get("short_code"), country: get("country"), address: get("address") });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ imported: 0, total: rows.length, skipped });
  }

  const { data: existing } = await supabase
    .from("parties")
    .select("id, legal_name, roles, short_code, country, address")
    .eq("company_id", DEFAULT_COMPANY_ID);
  const existingByName = new Map<string, any>((existing ?? []).map((p: any) => [p.legal_name.toLowerCase(), p]));

  const toCreate: any[] = [];
  const toUpdateRole: { id: string; roles: string[] }[] = [];
  let imported = 0;

  for (const c of candidates) {
    const match = existingByName.get(c.name.toLowerCase());
    if (match) {
      if ((match.roles ?? []).includes(role)) {
        skipped.push({ row: c.sheetRow, reason: `"${c.name}" already exists as a ${role}` });
        continue;
      }
      toUpdateRole.push({ id: match.id, roles: [...(match.roles ?? []), role] });
      imported++;
    } else {
      toCreate.push({
        company_id: DEFAULT_COMPANY_ID,
        legal_name: c.name,
        short_code: c.short_code || null,
        country: c.country || null,
        address: c.address || null,
        roles: [role]
      });
      imported++;
    }
  }

  if (toCreate.length > 0) {
    const { error } = await supabase.from("parties").insert(toCreate);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  for (const u of toUpdateRole) {
    await supabase.from("parties").update({ roles: u.roles }).eq("id", u.id);
  }

  return NextResponse.json({ imported, total: rows.length, skipped });
}
