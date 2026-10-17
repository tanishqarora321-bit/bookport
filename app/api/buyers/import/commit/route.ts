import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { BUYER_ADDRESS_LINE_KEYS } from "@/lib/buyer-import-fields";

export const maxDuration = 60;

type Skip = { row: number; reason: string };

// Two-level import: rows sharing the same Folder's Name (case-insensitive)
// become separate buyer_gst_entries under ONE parties row (find-or-create,
// same case-insensitive matching every other party import uses), not
// separate buyers - see lib/buyer-import-fields.ts. A row with no Folder's
// Name of its own falls back to using its GST/company name as the folder,
// matching the common case of a standalone buyer with no group.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const companyId = me.company_id;

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

  if (colIndex["legal_name"] === undefined) {
    return NextResponse.json({ error: "GST / Company Legal Name must be mapped to a column before importing." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const skipped: Skip[] = [];

  type Candidate = { sheetRow: number; folderName: string; legalName: string; address: string; gstNo: string; iecCode: string; mobile: string; email: string; description: string; hsCode: string };
  const candidates: Candidate[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRow = i + 2;
    const get = (key: string) => (colIndex[key] !== undefined ? (row[colIndex[key]] ?? "").trim() : "");

    const legalName = get("legal_name");
    if (!legalName) {
      skipped.push({ row: sheetRow, reason: "GST / Company Legal Name is blank" });
      continue;
    }
    const folderName = get("folder_name") || legalName;
    const address = BUYER_ADDRESS_LINE_KEYS.map((k) => get(k)).filter(Boolean).join("\n");

    candidates.push({
      sheetRow,
      folderName,
      legalName,
      address,
      gstNo: get("gst_no"),
      iecCode: get("iec_code"),
      mobile: get("mobile"),
      email: get("email"),
      description: get("description_of_goods"),
      hsCode: get("hs_code"),
    });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ imported: 0, total: rows.length, skipped });
  }

  // Find-or-create the parent buyer party per unique folder name, same
  // case-insensitive matching as lib/find-or-create-party.ts, batched
  // rather than one row at a time.
  const { data: existingParties } = await supabase
    .from("parties")
    .select("id, legal_name, roles")
    .eq("company_id", companyId);
  const partyByName = new Map<string, { id: string; roles: string[] }>((existingParties ?? []).map((p: any) => [p.legal_name.toLowerCase(), { id: p.id, roles: p.roles ?? [] }]));

  const folderNamesSeen = new Map<string, string>(); // lowercase -> original casing (first seen)
  for (const c of candidates) {
    const key = c.folderName.toLowerCase();
    if (!folderNamesSeen.has(key)) folderNamesSeen.set(key, c.folderName);
  }

  const toCreate: { company_id: string; legal_name: string; roles: string[] }[] = [];
  for (const [key, original] of folderNamesSeen) {
    if (!partyByName.has(key)) {
      toCreate.push({ company_id: companyId, legal_name: original, roles: ["buyer"] });
    }
  }
  if (toCreate.length > 0) {
    const { data: created, error: createError } = await supabase.from("parties").insert(toCreate).select("id, legal_name, roles");
    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
    for (const p of created ?? []) partyByName.set(p.legal_name.toLowerCase(), { id: p.id, roles: p.roles ?? [] });
  }

  // Existing parties matched by folder name that don't have the 'buyer'
  // role yet (e.g. already a forwarder under the same company name) get
  // it added, same as every other party import's role-merge behavior.
  const toAddRole: string[] = [];
  for (const [key] of folderNamesSeen) {
    const existing = partyByName.get(key)!;
    if (!existing.roles.includes("buyer")) toAddRole.push(existing.id);
  }
  for (const id of toAddRole) {
    const existing = Array.from(partyByName.values()).find((p) => p.id === id)!;
    await supabase.from("parties").update({ roles: [...existing.roles, "buyer"] }).eq("id", id);
  }

  const entriesToInsert = candidates.map((c) => ({
    buyer_party_id: partyByName.get(c.folderName.toLowerCase())!.id,
    legal_name: c.legalName,
    gst_no: c.gstNo || null,
    iec_code: c.iecCode || null,
    address: c.address || null,
    mobile: c.mobile || null,
    email: c.email || null,
    description_of_goods: c.description || null,
    hs_code: c.hsCode || null,
  }));

  const { error: insertError } = await supabase.from("buyer_gst_entries").insert(entriesToInsert);
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ imported: candidates.length, total: rows.length, skipped });
}
