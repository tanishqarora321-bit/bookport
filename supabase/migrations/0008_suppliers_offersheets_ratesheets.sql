-- ============================================================
-- BOOKPORT · Suppliers, Offer Sheet, and Freight/Rate Sheet schema
--
-- UNDOCUMENTED IN ANY HANDOFF — these 8 tables exist live
-- (verified via schema introspection) but aren't mentioned in
-- either project handoff, and no app code in this repo references
-- them yet. They appear to be schema laid down ahead of building
-- the Suppliers, Offer Sheet, and Freight Comparison modules
-- (all three still listed as "not yet built"). Reconstructed here
-- purely to close the git/live-database gap — see the note at the
-- bottom of 0003 for the general caveat on this whole file series.
-- ============================================================

create table if not exists supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  supplier_id uuid not null references parties(id),
  tracking_id uuid references tracking(id),
  booking_number text,
  container_number text,
  month_of_loading date,
  forwarder_name text,
  consignee_name text,
  invoice_number text,
  invoice_date date,
  currency text not null default 'EUR',
  total numeric not null default 0,
  paid_status text not null default 'UNPAID',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table supplier_invoices enable row level security;

drop policy if exists supplier_invoices_company_isolation on supplier_invoices;
create policy supplier_invoices_company_isolation on supplier_invoices
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

create table if not exists supplier_invoice_items (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null references supplier_invoices(id) on delete cascade,
  description text,
  weight_kg numeric,
  unit_price numeric,
  amount numeric not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists offer_sheet_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  columns jsonb not null,
  created_at timestamptz not null default now()
);

alter table offer_sheet_types enable row level security;

drop policy if exists offer_sheet_types_company_isolation on offer_sheet_types;
create policy offer_sheet_types_company_isolation on offer_sheet_types
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

create table if not exists offer_sheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  offer_sheet_type_id uuid not null references offer_sheet_types(id),
  title text not null,
  period date,
  settings jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table offer_sheets enable row level security;

drop policy if exists offer_sheets_company_isolation on offer_sheets;
create policy offer_sheets_company_isolation on offer_sheets
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

create table if not exists offer_sheet_rows (
  id uuid primary key default gen_random_uuid(),
  offer_sheet_id uuid not null references offer_sheets(id) on delete cascade,
  group_key text,
  row_data jsonb not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists rate_sheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  forwarder_id uuid references parties(id),
  forwarder_name text not null,
  destination text not null default 'Mundra, IN',
  rate_month date not null,
  currency text not null default 'USD',
  source_type text not null default 'manual',
  source_file_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rate_sheets enable row level security;

drop policy if exists rate_sheets_company_isolation on rate_sheets;
create policy rate_sheets_company_isolation on rate_sheets
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

create table if not exists rate_sheet_entries (
  id uuid primary key default gen_random_uuid(),
  rate_sheet_id uuid not null references rate_sheets(id) on delete cascade,
  origin text not null,
  shipping_line text not null,
  rate numeric,
  free_days int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists booking_consignee_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  description text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
