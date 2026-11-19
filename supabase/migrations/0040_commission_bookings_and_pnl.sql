-- ============================================================
-- BOOKPORT · Commission Bookings + P&L adjustments (owner, 2026-11)
--
-- commission_bookings: bookings the company earns a commission on, added
-- by hand only (Operations > Commission Bookings). Their Commission Amount
-- is the P&L's Commission for that container (matched by container number).
--
-- pnl_adjustments: the per-container values typed on the P&L page -
-- Pier Pass, Discount to customer, Discount from supplier.
--
-- Safe to run more than once.
-- ============================================================

create table if not exists commission_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  booking_number text,
  container_number text,
  commission_party text,
  commission_amount numeric not null default 0,
  month_of_loading date not null default (date_trunc('month', now()))::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commission_bookings_company_idx on commission_bookings (company_id);

alter table commission_bookings enable row level security;

drop policy if exists commission_bookings_company_isolation on commission_bookings;
create policy commission_bookings_company_isolation on commission_bookings
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

create table if not exists pnl_adjustments (
  tracking_id uuid primary key references tracking(id) on delete cascade,
  company_id uuid not null references companies(id),
  pier_pass numeric not null default 0,
  discount_to_customer numeric not null default 0,
  discount_from_supplier numeric not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists pnl_adjustments_company_idx on pnl_adjustments (company_id);

alter table pnl_adjustments enable row level security;

drop policy if exists pnl_adjustments_company_isolation on pnl_adjustments;
create policy pnl_adjustments_company_isolation on pnl_adjustments
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());
