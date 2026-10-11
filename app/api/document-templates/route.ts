import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// One physical company letterhead backs both doc types (Final Invoice
// and Booking Instructions) - PATCH writes the same template_config to
// every document_templates row for this company so Settings only needs
// one form, not one per doc type.
export async function PATCH(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Only an admin can edit the company letterhead" }, { status: 403 });

  const body = await req.json();
  const config = {
    company_name: (body.company_name ?? "").trim(),
    address_lines: Array.isArray(body.address_lines) ? body.address_lines.filter((l: string) => l.trim()) : [],
    phone: (body.phone ?? "").trim() || undefined,
    fax: (body.fax ?? "").trim() || undefined,
    email: (body.email ?? "").trim() || undefined,
    accent_color: (body.accent_color ?? "").trim() || undefined,
    shipper_declaration: (body.shipper_declaration ?? "").trim() || undefined,
  };

  if (!config.company_name) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Merge onto each row's existing config rather than overwrite wholesale,
  // so shipper_declaration (only meaningful on booking_instruction) isn't
  // clobbered to undefined on a final_invoice row and vice versa.
  const { data: rows, error: fetchError } = await supabase
    .from("document_templates")
    .select("id, doc_type, template_config")
    .eq("company_id", me.company_id);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  if (!rows || rows.length === 0) {
    const { error: insertError } = await supabase.from("document_templates").insert([
      { company_id: me.company_id, doc_type: "final_invoice", template_config: config, is_default: true },
      { company_id: me.company_id, doc_type: "booking_instruction", template_config: config, is_default: true },
    ]);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  for (const row of rows) {
    const merged = { ...(row.template_config ?? {}), ...config };
    const { error: updateError } = await supabase.from("document_templates").update({ template_config: merged }).eq("id", row.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
