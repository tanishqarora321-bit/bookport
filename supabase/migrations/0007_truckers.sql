-- ============================================================
-- BOOKPORT · Truckers ledger
-- RECONSTRUCTED — see the note at the bottom of 0003 for why.
--
-- This reflects the CORRECTED live shape (amount + charges_note),
-- not the version that was originally run and had to be patched live
-- via `alter table trucker_invoices rename column total_amount to amount;
-- alter table trucker_invoices add column if not exists charges_note text;`
-- per the handoff notes — that patch has already happened, this file
-- just documents the end state so a fresh database matches it directly.
--
-- Single amount + free-text charges_note (not itemized charge columns
-- like forwarder_invoices) because real trucker invoices from different
-- companies break down charges completely differently — some itemize
-- Freight/FSC/Chassis/Split/Return, others show one Line Haul total.
-- ============================================================

create table if not exists trucker_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  trucker_id uuid not null references parties(id),
  tracking_id uuid references tracking(id),
  booking_number text,
  container_number text,
  month_of_loading date,
  -- Deliberately NOT auto-filled from tracking/booking POL — a trucker's
  -- pickup location (e.g. an inland depot) is a different concept from
  -- the ocean port of loading. Always a manual field.
  location text,
  invoice_number text,
  invoice_date date,
  invoice_due_date date,
  amount numeric default 0,
  currency text default 'USD' references currencies(code),
  paid_status text not null default 'UNPAID',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  charges_note text
);

alter table trucker_invoices enable row level security;

drop policy if exists trucker_invoices_company_isolation on trucker_invoices;
create policy trucker_invoices_company_isolation on trucker_invoices
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());
