-- ============================================================
-- BOOKPORT · Buyer goods descriptions (Items assigned to Buyers)
--
-- A buyer can buy several kinds of goods ("Mixed Rags", "Cream Rags"...).
-- The company's Items list (items, 0003) is the master list of goods
-- descriptions; this table says which items belong to which buyer, so the
-- Final Invoice page offers that buyer's descriptions in a dropdown. The
-- item chosen on an invoice is stored on its tracking row (tracking.item_id,
-- already there), which is what Profit & Loss by goods / by buyer reads.
-- Safe to run more than once.
-- ============================================================

create table if not exists buyer_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  buyer_id uuid not null references parties(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (buyer_id, item_id)
);

create index if not exists buyer_items_company_idx on buyer_items (company_id);

alter table buyer_items enable row level security;

drop policy if exists buyer_items_company_isolation on buyer_items;
create policy buyer_items_company_isolation on buyer_items
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());
