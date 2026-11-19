// Which version of a generated document is "the" one (owner, 2026-11-19):
// the version locked on the Final Invoice page (field_data.locked) when
// there is one - that's what Shipment Tracking shows and emails - else the
// newest. Works for any doc_type.
type DocLike = { doc_type: string; version: number; created_at?: string | null; field_data?: any; pdf_path?: string | null };

export function isLocked(d: DocLike) {
  return !!d.field_data?.locked;
}

export function pickDoc<T extends DocLike>(docs: T[] | null | undefined, type: string): T | null {
  const list = (docs ?? []).filter((d) => d.doc_type === type);
  const locked = list.find(isLocked);
  if (locked) return locked;
  return (
    list.sort((a, b) => b.version - a.version || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0] ?? null
  );
}
