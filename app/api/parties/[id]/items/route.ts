import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { assignItemToBuyer, findOrCreateItem, listItemsForBuyer } from "@/lib/buyer-items";

// A buyer's goods descriptions (lib/buyer-items.ts).
async function ownBuyer(supabase: any, id: string, companyId: string) {
  const { data } = await supabase.from("parties").select("id").eq("id", id).eq("company_id", companyId).maybeSingle();
  return !!data;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createServiceClient();
  if (!(await ownBuyer(supabase, params.id, me.company_id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await listItemsForBuyer(supabase, me.company_id, params.id));
}

// { item_id } assigns an existing item; { name } finds or creates the item
// (it then also appears in the Items tab) and assigns it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json();
  const supabase = createServiceClient();
  if (!(await ownBuyer(supabase, params.id, me.company_id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let item: { id: string; name: string } | null = null;
  if (body.item_id) {
    const { data } = await supabase.from("items").select("id, name").eq("id", body.item_id).eq("company_id", me.company_id).maybeSingle();
    item = data;
  } else if (body.name) {
    item = await findOrCreateItem(supabase, me.company_id, String(body.name));
  }
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 400 });
  const ok = await assignItemToBuyer(supabase, me.company_id, params.id, item.id);
  if (!ok) {
    return NextResponse.json(
      { error: "Assigning goods to buyers needs a one-time database update (migration 0039_buyer_items.sql in Supabase's SQL Editor).", item },
      { status: 409 }
    );
  }
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const itemId = req.nextUrl.searchParams.get("item_id");
  if (!itemId) return NextResponse.json({ error: "item_id is required" }, { status: 400 });
  const supabase = createServiceClient();
  const { error } = await supabase.from("buyer_items").delete().eq("company_id", me.company_id).eq("buyer_id", params.id).eq("item_id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
