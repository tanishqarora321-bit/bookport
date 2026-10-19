-- ============================================================
-- BOOKPORT · Payment History per party (Forwarders/Suppliers/Truckers)
--
-- Separate from the existing per-invoice PAID/UNPAID toggle (which stays
-- exactly as-is, manually adjustable) - this is a running log of actual
-- payments made to a party, so "how much do we currently owe this
-- forwarder" can be a real number (all-time invoiced minus all-time
-- paid) instead of just a per-invoice flag. applies_to_year is asked
-- explicitly when a payment is added (not derived from paid_on) since
-- a payment's date and which year's dues it's meant to settle can
-- genuinely differ (e.g. a January payment clearing December's bill) -
-- this is the field P&L's year-wise view reads, NOT the always-current
-- running balance, which is deliberately never year-scoped.
-- ============================================================

create table if not exists party_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  party_id uuid not null references parties(id),
  amount numeric not null check (amount > 0),
  currency text not null default 'USD',
  fx_rate numeric not null default 1,
  paid_on date not null default current_date,
  applies_to_year int not null,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists party_payments_party_id_idx on party_payments (party_id);

alter table party_payments enable row level security;

drop policy if exists party_payments_company_isolation on party_payments;
create policy party_payments_company_isolation on party_payments
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());
