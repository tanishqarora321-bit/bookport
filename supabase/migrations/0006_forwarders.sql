-- ============================================================
-- BOOKPORT · Forwarders (AP ledger)
-- RECONSTRUCTED — see the note at the bottom of 0003 for why.
-- ============================================================

alter table tracking add column if not exists forwarder_id uuid references parties(id);

create table if not exists forwarder_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  forwarder_id uuid not null references parties(id),
  -- Live-joined, never copied: consignee/POL/POD/shipping_line/month_of_loading
  -- below are static snapshots taken at entry time; ETA/status are read live
  -- from `tracking` via this FK at render time, never stored here.
  tracking_id uuid references tracking(id),
  booking_number text,
  container_number text,
  month_of_loading date,
  shipping_line text,
  consignee_party_id uuid references parties(id),
  consignee_name text,
  pol text,
  pod text,
  invoice_number text,
  invoice_date date,
  invoice_due_date date,
  freight_charges numeric default 0,
  bl_fees numeric default 0,
  aes_fees numeric default 0,
  extra_charges numeric default 0,
  correction_charges numeric default 0,
  demurrage numeric default 0,
  -- NOTE: exact generated-column expression is a best-effort
  -- reconstruction (matched against a real $3,235.00 invoice per the
  -- handoff notes, but the live `pg_get_expr` text was never re-checked
  -- through this introspection route) — verify before relying on it.
  total numeric generated always as (
    coalesce(freight_charges, 0) + coalesce(bl_fees, 0) + coalesce(aes_fees, 0)
    + coalesce(extra_charges, 0) + coalesce(correction_charges, 0) + coalesce(demurrage, 0)
  ) stored,
  currency text default 'USD' references currencies(code),
  paid_status text not null default 'UNPAID',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table forwarder_invoices enable row level security;

drop policy if exists forwarder_invoices_company_isolation on forwarder_invoices;
create policy forwarder_invoices_company_isolation on forwarder_invoices
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());
