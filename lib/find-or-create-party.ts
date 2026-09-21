// Shared by every "+ New <role>" quick-create endpoint (Forwarders,
// Truckers, Suppliers, Buyers) and the bulk booking Excel import - a
// party name typed with different casing ("UAL" vs "ual") used to
// create a second, duplicate party instead of reusing the existing
// one. ilike with no wildcards is a case-insensitive exact match, not
// a substring search.
export async function findOrCreateParty(
  supabase: any,
  companyId: string,
  role: string,
  fields: { legal_name: string; short_code?: string | null; country?: string | null; address?: string | null }
): Promise<{ party: any; created: boolean }> {
  const name = fields.legal_name.trim();

  const { data: existing, error: findError } = await supabase
    .from("parties")
    .select("id, legal_name, roles, short_code, country, address")
    .eq("company_id", companyId)
    .ilike("legal_name", name)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    if ((existing.roles ?? []).includes(role)) {
      return { party: existing, created: false };
    }
    // Same company/name, but not yet used in this role - add the role
    // rather than creating a second party row for one real company.
    const { data: updated, error: updateError } = await supabase
      .from("parties")
      .update({ roles: [...(existing.roles ?? []), role] })
      .eq("id", existing.id)
      .select()
      .single();
    if (updateError) throw updateError;
    return { party: updated, created: false };
  }

  const { data: created, error: createError } = await supabase
    .from("parties")
    .insert({
      company_id: companyId,
      legal_name: name,
      short_code: fields.short_code?.trim() || null,
      country: fields.country?.trim() || null,
      address: fields.address?.trim() || null,
      roles: [role]
    })
    .select()
    .single();
  if (createError) throw createError;
  return { party: created, created: true };
}
