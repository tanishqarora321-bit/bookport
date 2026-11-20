function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// The per-container add-on fields (migration 0041). Clean numbers only.
export function cleanAddOn(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  if ("add_on" in body) out.add_on = numOrNull(body.add_on) ?? 0;
  if ("add_on_by_line" in body) {
    const by: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.add_on_by_line ?? {})) {
      const n = numOrNull(v);
      if (k.trim() && n !== null) by[k.trim().toUpperCase()] = n;
    }
    out.add_on_by_line = by;
  }
  if ("charges_note" in body) out.charges_note = (body.charges_note ?? "").toString().trim() || null;
  return out;
}

