-- ============================================================
-- BOOKPORT · Initial schema
-- One parties table (roles as a flag set), booking_no as a
-- business key (never the primary key), UUIDs everywhere else.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Master / lookup tables ----------

create table charge_heads (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,          -- 'Ocean freight', 'THC origin', 'BL fee', 'Haulage', 'Detention'
  direction_default text check (direction_default in ('cost','sell','either')) default 'either'
);

create table ports (
  unlocode text primary key,          -- e.g. 'INMUN'
  name text not null,
  country text
);

create table currencies (
  code text primary key,              -- 'USD','EUR','INR'
  name text
);

-- Cutoff-label aliases (Settings > Numbering & Label Rules).
-- This is what lets a new carrier's phrasing be a config row, not a code change.
create table cutoff_label_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_field text not null check (canonical_field in ('cargo_cutoff','si_cutoff','vgm_cutoff','rail_cutoff')),
  carrier_name text,
  raw_label text not null
);

-- ---------- Identity ----------
-- profiles mirrors auth.users with an app role. 4 roles per the brief:
-- admin / operations / finance / readonly (customer portal).
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('admin','operations','finance','readonly')) default 'operations',
  party_id uuid,                      -- for readonly/customer users: which party they see
  created_at timestamptz default now()
);

-- ---------- Parties (one table, four roles) ----------

create table parties (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  short_code text,
  roles text[] not null default '{}',  -- subset of {forwarder, supplier, buyer, trucker}
  tax_id text,
  country text,
  address text,
  payment_terms text,
  currency text references currencies(code),
  notes text,
  created_at timestamptz default now()
);

create table party_contacts (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references parties(id) on delete cascade,
  name text,
  role text,
  email text,
  phone text,
  is_primary boolean default false
);

-- ---------- Bookings (the spine) ----------

create table bookings (
  id uuid primary key default gen_random_uuid(),
  booking_no text not null unique,     -- business key, e.g. BP-26-0417
  status text not null default 'draft' check (status in ('draft','confirmed','in_transit','delivered','cancelled')),
  mode text check (mode in ('sea','air')) default 'sea',
  type text check (type in ('FCL','LCL')) default 'FCL',
  incoterm text,

  place_of_receipt text,
  pol text,
  pod text,
  final_destination text,

  cargo_cutoff timestamptz,
  si_cutoff timestamptz,
  vgm_cutoff timestamptz,
  rail_cutoff timestamptz,

  etd timestamptz,
  eta timestamptz,
  carrier text,
  vessel text,
  voyage text,
  carrier_booking_no text,

  commodity text,
  hs_code text,
  packages int,
  gross_weight numeric,
  cbm numeric,
  free_days int,
  instructions text,

  version int not null default 1,
  owner_user_id uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on bookings (booking_no);
create index on bookings (status);

create table booking_parties (
  booking_id uuid references bookings(id) on delete cascade,
  party_id uuid references parties(id),
  role text check (role in ('forwarder','supplier','buyer','trucker','notify','consignee')),
  primary key (booking_id, party_id, role)
);

-- Multi-leg routing: rail-to-port, transshipment ports, post-carriage.
create table transport_legs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  seq int not null,
  from_location text not null,
  to_location text not null,
  transport_mode text check (transport_mode in ('rail','vessel','truck','unknown')),
  vessel_voyage text,
  etd timestamptz,
  eta timestamptz
);

create table containers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  container_no text,
  seal_no text,
  size_type text,
  tare numeric,
  vgm_weight numeric,
  vgm_filed_at timestamptz
);

create table tracking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  container_id uuid references containers(id),
  milestone_code text not null,   -- empty_pickup, gate_in, vgm_filed, si_filed, loaded, sailed, transhipped, arrived, discharged, delivered, empty_returned
  planned_at timestamptz,
  actual_at timestamptz,
  location text,
  source text check (source in ('manual','api','email')) default 'manual',
  note text
);

create table trucking_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  trucker_party_id uuid references parties(id),
  pickup_at timestamptz,
  pickup_address text,
  gate_in_at timestamptz,
  vehicle_no text,
  driver_name text,
  driver_phone text,
  lr_no text,
  trip_rate numeric,
  pod_document_id uuid,
  status text check (status in ('assigned','picked_up','delivered','cancelled')) default 'assigned'
);

-- ---------- Rates / Offers ----------

create table rate_quotes (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid,
  booking_id uuid references bookings(id),
  forwarder_party_id uuid references parties(id),
  pol text,
  pod text,
  container_type text,
  valid_from date,
  valid_to date,
  transit_days int,
  charges jsonb,
  total numeric,
  currency text references currencies(code),
  is_selected boolean default false
);

create table offers (
  id uuid primary key default gen_random_uuid(),
  offer_no text unique,
  buyer_party_id uuid references parties(id),
  booking_id uuid references bookings(id),
  based_on_quote_id uuid references rate_quotes(id),
  valid_to date,
  status text check (status in ('draft','sent','won','lost')) default 'draft',
  sent_at timestamptz
);

-- ---------- Money ----------

create table charges (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  charge_head_id uuid references charge_heads(id),
  counterparty_id uuid references parties(id),
  direction text check (direction in ('cost','sell')) not null,
  amount numeric not null,
  currency text references currencies(code),
  fx_rate numeric not null default 1,   -- stored at entry time, never recomputed at report time
  is_estimate boolean default true,
  invoice_line_id uuid,
  created_at timestamptz default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,
  direction text check (direction in ('AR','AP')) not null,
  party_id uuid references parties(id),
  booking_id uuid references bookings(id),
  issue_date date,
  due_date date,
  currency text references currencies(code),
  fx_rate numeric default 1,
  subtotal numeric,
  tax numeric,
  total numeric,
  status text check (status in ('draft','sent','paid','overdue','void')) default 'draft',
  qb_sync_id text
);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  charge_id uuid references charges(id),
  description text,
  qty numeric default 1,
  rate numeric,
  amount numeric,
  tax_rate numeric default 0
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  paid_on date,
  amount numeric,
  currency text references currencies(code),
  fx_rate numeric default 1,
  method text,
  reference text
);

-- ---------- Documents, amendments, audit ----------

create table documents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  doc_type text,                       -- booking_confirmation, rate_sheet, invoice, packing_list
  file_path text not null,
  uploaded_by uuid references profiles(id),
  extraction_status text check (extraction_status in ('pending','extracted','reviewed','failed')) default 'pending',
  extracted_json jsonb,
  model_used text,
  confidence numeric,
  created_at timestamptz default now()
);

create table amendments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  version int not null,
  changed_fields jsonb not null,       -- { field: {old, new} }
  reason text,
  notified_party_ids uuid[],
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id uuid not null,
  field text,
  old_value text,
  new_value text,
  user_id uuid references profiles(id),
  at timestamptz default now()
);

-- ============================================================
-- Row-Level Security
-- Cost data is hidden from 'operations'; readonly sees only
-- their own party's bookings via booking_parties.
-- ============================================================

alter table bookings enable row level security;
alter table charges enable row level security;
alter table invoices enable row level security;
alter table parties enable row level security;
alter table booking_parties enable row level security;

create or replace function current_role_name() returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql stable;

-- Admin/Operations/Finance: full read on bookings. Readonly: only bookings linked to their party.
create policy bookings_select on bookings for select using (
  current_role_name() in ('admin','operations','finance')
  or exists (
    select 1 from booking_parties bp, profiles p
    where bp.booking_id = bookings.id and p.id = auth.uid() and bp.party_id = p.party_id
  )
);

create policy bookings_write on bookings for all using (
  current_role_name() in ('admin','operations')
) with check (
  current_role_name() in ('admin','operations')
);

-- Charges: cost/sell figures - operations role explicitly excluded per the brief ("sees cost but not margin").
create policy charges_select on charges for select using (
  current_role_name() in ('admin','finance')
);

create policy charges_write on charges for all using (
  current_role_name() in ('admin','finance')
) with check (
  current_role_name() in ('admin','finance')
);

create policy invoices_all on invoices for all using (
  current_role_name() in ('admin','finance')
) with check (
  current_role_name() in ('admin','finance')
);

create policy parties_select on parties for select using (true);
create policy parties_write on parties for all using (
  current_role_name() in ('admin','operations')
) with check (
  current_role_name() in ('admin','operations')
);

create policy booking_parties_select on booking_parties for select using (true);
