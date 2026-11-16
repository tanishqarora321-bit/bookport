// Goods descriptions per buyer (owner, 2026-11): the company's Items list
// is the master list of descriptions ("Mixed Rags", "Cream Rags"...), and
// buyer_items (migration 0039) says which belong to which buyer. An item a
// buyer's invoice already used (tracking.item_id) counts as theirs too, so
// the dropdown is useful even before anything is assigned - and if 0039
// hasn't been run yet, that's all it shows (nothing breaks).
export type ItemRow = { id: string; name: string; is_active: boolean | null };

export async function listItemsForBuyer(supabase: any, companyId: string, buyerId: string) {
  const [{ data: all }, assigned, { data: used }] = await Promise.all([
    supabase.from("items").select("id, name, is_active").eq("company_id", companyId).order("name"),
    supabase.from("buyer_items").select("item_id").eq("company_id", companyId).eq("buyer_id", buyerId),
    supabase.from("tracking").select("item_id").eq("company_id", companyId).eq("party_id", buyerId).not("item_id", "is", null),
  ]);
  const tableReady = !assigned.error;
  const ids = new Set<string>([
    ...((assigned.data ?? []) as { item_id: string }[]).map((r) => r.item_id),
    ...((used ?? []) as { item_id: string }[]).map((r) => r.item_id),
  ]);
  const allItems: ItemRow[] = (all ?? []).filter((i: ItemRow) => i.is_active !== false);
  return { buyerItems: allItems.filter((i) => ids.has(i.id)), allItems, tableReady };
}

// Assigns an item to a buyer (no-op if already assigned, or if 0039 hasn't
// been run - then it returns false).
export async function assignItemToBuyer(supabase: any, companyId: string, buyerId: string, itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from("buyer_items")
    .upsert({ company_id: companyId, buyer_id: buyerId, item_id: itemId }, { onConflict: "buyer_id,item_id", ignoreDuplicates: true });
  return !error;
}

// The item with this name (any letter case; a removed one is restored), or
// a new one.
export async function findOrCreateItem(supabase: any, companyId: string, name: string): Promise<ItemRow | null> {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const { data: matches } = await supabase.from("items").select("id, name, is_active").eq("company_id", companyId).ilike("name", clean);
  const hit = ((matches ?? []) as ItemRow[]).find((i) => i.name.trim().toLowerCase() === clean.toLowerCase());
  if (hit) {
    if (hit.is_active === false) await supabase.from("items").update({ is_active: true }).eq("id", hit.id);
    return { ...hit, is_active: true };
  }
  const { data, error } = await supabase.from("items").insert({ company_id: companyId, name: clean }).select("id, name, is_active").single();
  return error ? null : data;
}
