import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

const MAX_CUSTOM_COLUMNS = 10;

function slugify(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "charge";
}

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("forwarder_invoice_custom_columns")
    .select("id, key, label")
    .eq("company_id", DEFAULT_COMPANY_ID)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ columns: data ?? [] });
}

// Shared across every forwarder's ledger (not per-forwarder) - the
// person adding it sees a confirm() first client-side, since this
// column then shows up for every other forwarder's invoices too.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const label = (body.label ?? "").toString().trim();
  if (!label) return NextResponse.json({ error: "Column name is required" }, { status: 400 });

  const supabase = createServiceClient();

  const { count, error: countError } = await supabase
    .from("forwarder_invoice_custom_columns")
    .select("id", { count: "exact", head: true })
    .eq("company_id", DEFAULT_COMPANY_ID);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if ((count ?? 0) >= MAX_CUSTOM_COLUMNS) {
    return NextResponse.json({ error: `You already have ${MAX_CUSTOM_COLUMNS} custom columns, the maximum.` }, { status: 400 });
  }

  const baseKey = slugify(label);
  let column: any = null;
  for (const key of [baseKey, `${baseKey}_${Math.random().toString(36).slice(2, 5)}`]) {
    const { data, error } = await supabase
      .from("forwarder_invoice_custom_columns")
      .insert({ company_id: DEFAULT_COMPANY_ID, key, label })
      .select()
      .single();
    if (!error) {
      column = data;
      break;
    }
    if (error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!column) return NextResponse.json({ error: "Could not create a unique column key - try a different name" }, { status: 500 });

  return NextResponse.json({ column });
}
