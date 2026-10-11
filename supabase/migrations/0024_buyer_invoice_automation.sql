-- ============================================================
-- BOOKPORT · Buyer Invoices (sales/A-R ledger for Buyers/Customers)
--
-- Mirrors supplier_invoices/supplier_invoice_items (0008) almost
-- exactly - same auto-shell-on-assign, same cost-section-as-line-items
-- shape, same bidirectional unassign-on-delete. The difference is
-- semantic, not structural: a buyer invoice is what THIS company bills
-- the buyer/consignee (sales/A-R), not what a vendor bills this company
-- (cost/A-P) - so there's no separate "consignee_name" column (the
-- buyer already IS the consignee), and a few buyer-specific header
-- fields (bl_date, due_date, weight, location) exist because the real
-- account-statement sheets Tanishq uses carry them.
-- ============================================================

create table if not exists buyer_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  buyer_id uuid not null references parties(id),
  tracking_id uuid references tracking(id),
  booking_number text,
  container_number text,
  location text,
  month_of_loading date,
  bl_date date,
  due_date date,
  forwarder_name text,
  invoice_number text,
  invoice_date date,
  weight numeric,
  weight_unit text not null default 'LBS' check (weight_unit in ('LBS', 'KG')),
  currency text not null default 'USD',
  total numeric not null default 0,
  fx_rate numeric not null default 1,
  total_usd numeric generated always as (total * fx_rate) stored,
  paid_status text not null default 'UNPAID',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table buyer_invoices enable row level security;

drop policy if exists buyer_invoices_company_isolation on buyer_invoices;
create policy buyer_invoices_company_isolation on buyer_invoices
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- Same cost-section shape as supplier_invoice_items (description/weight/
-- unit_price/amount per line) - a real buyer invoice's lines are things
-- like "Mixed Rags" (the cargo value), "Freight", "Trucking",
-- "Commission", exactly matching the real sample invoices.
create table if not exists buyer_invoice_items (
  id uuid primary key default gen_random_uuid(),
  buyer_invoice_id uuid not null references buyer_invoices(id) on delete cascade,
  description text,
  weight_kg numeric,
  unit_price numeric,
  amount numeric not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- supplier_invoice_items never got RLS enabled in any migration (a real
-- gap in the existing feature) - not repeating that mistake here. Scoped
-- via the parent invoice's company_id, same pattern as buyer_gst_entries.
alter table buyer_invoice_items enable row level security;

drop policy if exists buyer_invoice_items_company_isolation on buyer_invoice_items;
create policy buyer_invoice_items_company_isolation on buyer_invoice_items
  for all using (
    buyer_invoice_id in (select id from buyer_invoices where company_id = current_company_id())
  )
  with check (
    buyer_invoice_id in (select id from buyer_invoices where company_id = current_company_id())
  );

-- One invoice shell per tracking row, same reasoning as
-- forwarder/supplier/trucker_invoices_tracking_id_key.
create unique index if not exists buyer_invoices_tracking_id_key
  on buyer_invoices (tracking_id)
  where tracking_id is not null;

-- supplier_invoices.total is kept correct by a recalc trigger that is
-- live in the DB but was never captured in a migration file (see the
-- 0020 comment). Writing buyer_invoices' version for real this time so a
-- fresh database doesn't silently diverge from production.
create or replace function recalc_buyer_invoice_total()
returns trigger as $$
declare
  v_invoice_id uuid;
begin
  v_invoice_id := coalesce(new.buyer_invoice_id, old.buyer_invoice_id);
  update buyer_invoices
    set total = coalesce((select sum(amount) from buyer_invoice_items where buyer_invoice_id = v_invoice_id), 0),
        updated_at = now()
    where id = v_invoice_id;
  return null;
end;
$$ language plpgsql;

drop trigger if exists buyer_invoice_items_recalc_total on buyer_invoice_items;
create trigger buyer_invoice_items_recalc_total
  after insert or update or delete on buyer_invoice_items
  for each row execute function recalc_buyer_invoice_total();

-- Extends sync_container_to_tracking() (forwarder in 0015/0018, supplier
-- in 0021, trucker in 0022) to also auto-create/reattach a pending buyer
-- invoice shell the moment a container exists with a buyer/consignee
-- assigned. v_buyer_id is already computed by this function (it's what
-- feeds tracking.party_id) - reused here rather than re-queried. Full
-- function body copied verbatim from 0022 with only the new buyer block
-- added, since `create or replace function` replaces the whole body.
create or replace function sync_container_to_tracking()
returns trigger as $$
declare
  v_booking record;
  v_forwarder_id uuid;
  v_forwarder_name text;
  v_buyer_id uuid;
  v_supplier_id uuid;
  v_trucker_id uuid;
  v_tracking_id uuid;
  v_reattached_count int;
begin
  if new.container_no is null then
    return new;
  end if;

  select id, company_id, carrier_booking_no, carrier, pol, pod
    into v_booking
    from bookings
    where id = new.booking_id;

  if v_booking.id is null then
    return new;
  end if;

  select party_id into v_forwarder_id
    from booking_parties
    where booking_id = new.booking_id and role = 'forwarder'
    limit 1;

  select party_id into v_buyer_id
    from booking_parties
    where booking_id = new.booking_id and role = 'buyer'
    limit 1;

  select party_id into v_supplier_id
    from booking_parties
    where booking_id = new.booking_id and role = 'supplier'
    limit 1;

  select party_id into v_trucker_id
    from booking_parties
    where booking_id = new.booking_id and role = 'trucker'
    limit 1;

  insert into tracking (company_id, booking_id, container_number, booking_number, shipping_line, forwarder_id, party_id)
  values (v_booking.company_id, new.booking_id, new.container_no, v_booking.carrier_booking_no, v_booking.carrier, v_forwarder_id, v_buyer_id)
  on conflict (booking_id, container_number) do update
    set booking_number = excluded.booking_number,
        shipping_line = excluded.shipping_line,
        forwarder_id = excluded.forwarder_id,
        party_id = excluded.party_id
  returning id into v_tracking_id;

  if v_forwarder_id is not null then
    update forwarder_invoices
      set tracking_id = v_tracking_id,
          pol = v_booking.pol,
          pod = v_booking.pod,
          shipping_line = v_booking.carrier,
          updated_at = now()
      where forwarder_id = v_forwarder_id
        and tracking_id is null
        and booking_number = v_booking.carrier_booking_no
        and container_number = new.container_no;
    get diagnostics v_reattached_count = row_count;

    if v_reattached_count = 0 then
      insert into forwarder_invoices (company_id, forwarder_id, tracking_id, booking_number, container_number, shipping_line, pol, pod)
      values (v_booking.company_id, v_forwarder_id, v_tracking_id, v_booking.carrier_booking_no, new.container_no, v_booking.carrier, v_booking.pol, v_booking.pod)
      on conflict (tracking_id) where tracking_id is not null do update
        set forwarder_id = excluded.forwarder_id,
            booking_number = excluded.booking_number,
            container_number = excluded.container_number,
            shipping_line = excluded.shipping_line,
            pol = excluded.pol,
            pod = excluded.pod,
            updated_at = now();
    end if;
  end if;

  if v_supplier_id is not null then
    if v_forwarder_id is not null then
      select legal_name into v_forwarder_name from parties where id = v_forwarder_id;
    else
      v_forwarder_name := null;
    end if;

    update supplier_invoices
      set tracking_id = v_tracking_id,
          forwarder_name = coalesce(v_forwarder_name, forwarder_name),
          updated_at = now()
      where supplier_id = v_supplier_id
        and tracking_id is null
        and booking_number = v_booking.carrier_booking_no
        and container_number = new.container_no;
    get diagnostics v_reattached_count = row_count;

    if v_reattached_count = 0 then
      insert into supplier_invoices (company_id, supplier_id, tracking_id, booking_number, container_number, forwarder_name)
      values (v_booking.company_id, v_supplier_id, v_tracking_id, v_booking.carrier_booking_no, new.container_no, v_forwarder_name)
      on conflict (tracking_id) where tracking_id is not null do update
        set supplier_id = excluded.supplier_id,
            booking_number = excluded.booking_number,
            container_number = excluded.container_number,
            forwarder_name = excluded.forwarder_name,
            updated_at = now();
    end if;
  end if;

  if v_trucker_id is not null then
    update trucker_invoices
      set tracking_id = v_tracking_id,
          updated_at = now()
      where trucker_id = v_trucker_id
        and tracking_id is null
        and booking_number = v_booking.carrier_booking_no
        and container_number = new.container_no;
    get diagnostics v_reattached_count = row_count;

    if v_reattached_count = 0 then
      insert into trucker_invoices (company_id, trucker_id, tracking_id, booking_number, container_number)
      values (v_booking.company_id, v_trucker_id, v_tracking_id, v_booking.carrier_booking_no, new.container_no)
      on conflict (tracking_id) where tracking_id is not null do update
        set trucker_id = excluded.trucker_id,
            booking_number = excluded.booking_number,
            container_number = excluded.container_number,
            updated_at = now();
    end if;
  end if;

  if v_buyer_id is not null then
    if v_forwarder_id is not null then
      select legal_name into v_forwarder_name from parties where id = v_forwarder_id;
    else
      v_forwarder_name := null;
    end if;

    update buyer_invoices
      set tracking_id = v_tracking_id,
          forwarder_name = coalesce(v_forwarder_name, forwarder_name),
          updated_at = now()
      where buyer_id = v_buyer_id
        and tracking_id is null
        and booking_number = v_booking.carrier_booking_no
        and container_number = new.container_no;
    get diagnostics v_reattached_count = row_count;

    if v_reattached_count = 0 then
      insert into buyer_invoices (company_id, buyer_id, tracking_id, booking_number, container_number, forwarder_name)
      values (v_booking.company_id, v_buyer_id, v_tracking_id, v_booking.carrier_booking_no, new.container_no, v_forwarder_name)
      on conflict (tracking_id) where tracking_id is not null do update
        set buyer_id = excluded.buyer_id,
            booking_number = excluded.booking_number,
            container_number = excluded.container_number,
            forwarder_name = excluded.forwarder_name,
            updated_at = now();
    end if;
  end if;

  return new;
end;
$$ language plpgsql;
