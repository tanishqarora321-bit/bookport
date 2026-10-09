-- ============================================================
-- BOOKPORT · Trucker invoices: itemized charge columns + automation
--
-- 0007 deliberately used a single `amount` + free-text `charges_note`
-- instead of itemized columns, reasoning that different trucking
-- companies break charges down completely differently. Overridden by
-- explicit instruction: match the Forwarders ledger exactly, with
-- fixed charge columns matching the real C&K Trucking statement
-- (TRUCKING / Sur. Fuel / Chassis Rental / Stop off / CHASIS SPLIT /
-- others) plus the same company-wide custom "Add Column" charges
-- Forwarders has. `amount`/`charges_note` are left in place, unused by
-- new code, rather than dropped - no reason to destroy whatever's
-- already stored there.
-- ============================================================

alter table trucker_invoices add column if not exists trucking numeric default 0;
alter table trucker_invoices add column if not exists fuel_surcharge numeric default 0;
alter table trucker_invoices add column if not exists chassis_rental numeric default 0;
alter table trucker_invoices add column if not exists stop_off numeric default 0;
alter table trucker_invoices add column if not exists chassis_split numeric default 0;
alter table trucker_invoices add column if not exists misc_charges numeric default 0;
alter table trucker_invoices add column if not exists custom_charges jsonb not null default '{}'::jsonb;

alter table trucker_invoices add column if not exists total numeric generated always as (
  coalesce(trucking, 0) + coalesce(fuel_surcharge, 0) + coalesce(chassis_rental, 0)
  + coalesce(stop_off, 0) + coalesce(chassis_split, 0) + coalesce(misc_charges, 0)
) stored;

-- Same cross-currency reporting need as forwarder_invoices (0015) and
-- supplier_invoices (0020) - fx_rate stored at entry time, never
-- recomputed at report time.
alter table trucker_invoices add column if not exists fx_rate numeric not null default 1;
alter table trucker_invoices add column if not exists total_usd numeric generated always as (
  (coalesce(trucking, 0) + coalesce(fuel_surcharge, 0) + coalesce(chassis_rental, 0)
   + coalesce(stop_off, 0) + coalesce(chassis_split, 0) + coalesce(misc_charges, 0))
  * fx_rate
) stored;

-- Mirrors forwarder_invoice_custom_columns (0016) exactly - shared
-- across every trucker's ledger, not per-trucker.
create table if not exists trucker_invoice_custom_columns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  key text not null,
  label text not null,
  created_at timestamptz not null default now(),
  unique (company_id, key)
);

alter table trucker_invoice_custom_columns enable row level security;

drop policy if exists trucker_invoice_custom_columns_company_isolation on trucker_invoice_custom_columns;
create policy trucker_invoice_custom_columns_company_isolation on trucker_invoice_custom_columns
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- One invoice shell per tracking row, same reasoning as
-- forwarder_invoices_tracking_id_key / supplier_invoices_tracking_id_key.
create unique index if not exists trucker_invoices_tracking_id_key
  on trucker_invoices (tracking_id)
  where tracking_id is not null;

-- Extends sync_container_to_tracking() (already handling forwarder in
-- 0015/0018 and supplier in 0021) to also auto-create/reattach a
-- pending trucker invoice shell the moment a container exists with a
-- trucker assigned - same trade-off noted there: reassigning a
-- booking's trucker moves the same shell rather than creating a second.
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

  return new;
end;
$$ language plpgsql;
