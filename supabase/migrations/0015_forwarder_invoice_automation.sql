-- ============================================================
-- BOOKPORT · Auto-create a forwarder invoice shell from tracking
--
-- The live sync_container_to_tracking() trigger (fires AFTER INSERT OR
-- UPDATE OF container_no ON containers - confirmed via pg_get_functiondef
-- against the live DB, since it was never captured in any prior
-- migration file) already knows everything a forwarder_invoices row's
-- descriptive fields need the moment a container gets a forwarder
-- assigned: booking_number, container_number, shipping_line, pol, pod.
-- This extends it to also upsert a "pending" forwarder_invoices row
-- (invoice_number/dates/charges left null/0) so ops never has to
-- manually look up a booking/container to start an invoice - they just
-- fill in the one that's already there.
--
-- Trade-off, noted rather than solved: if a booking's forwarder is
-- later reassigned (A -> B), the ON CONFLICT below moves the SAME
-- invoice shell to the new forwarder rather than creating a second
-- one. Fine for "wrong forwarder picked, fix it" - wrong if someone
-- had already filled in real invoice numbers/charges against forwarder
-- A and *intended* a second, separate invoice for B. Not handled
-- automatically; a real reassignment-after-billing case needs a human
-- to sort out which invoice belongs where.
-- ============================================================

-- One invoice shell per tracking row, so the upsert below has
-- something to conflict on.
create unique index if not exists forwarder_invoices_tracking_id_key
  on forwarder_invoices (tracking_id)
  where tracking_id is not null;

alter table forwarder_invoices add column if not exists fx_rate numeric not null default 1;
-- Every charge column is already in the invoice's own `currency`; this
-- is that same total normalized to USD for cross-currency reporting
-- without forcing every invoice to be entered in USD. Postgres won't
-- let a generated column reference another generated column (`total`
-- already is one), so this repeats total's own expression rather than
-- multiplying total * fx_rate directly.
alter table forwarder_invoices add column if not exists total_usd numeric generated always as (
  (coalesce(freight_charges, 0) + coalesce(bl_fees, 0) + coalesce(aes_fees, 0)
   + coalesce(extra_charges, 0) + coalesce(correction_charges, 0) + coalesce(demurrage, 0))
  * fx_rate
) stored;

create or replace function sync_container_to_tracking()
returns trigger as $$
declare
  v_booking record;
  v_forwarder_id uuid;
  v_buyer_id uuid;
  v_tracking_id uuid;
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

  insert into tracking (company_id, booking_id, container_number, booking_number, shipping_line, forwarder_id, party_id)
  values (v_booking.company_id, new.booking_id, new.container_no, v_booking.carrier_booking_no, v_booking.carrier, v_forwarder_id, v_buyer_id)
  on conflict (booking_id, container_number) do update
    set booking_number = excluded.booking_number,
        shipping_line = excluded.shipping_line,
        forwarder_id = excluded.forwarder_id,
        party_id = excluded.party_id
  returning id into v_tracking_id;

  if v_forwarder_id is not null then
    insert into forwarder_invoices (company_id, forwarder_id, tracking_id, booking_number, container_number, shipping_line, pol, pod)
    values (v_booking.company_id, v_forwarder_id, v_tracking_id, v_booking.carrier_booking_no, new.container_no, v_booking.carrier, v_booking.pol, v_booking.pod)
    on conflict (tracking_id) do update
      set forwarder_id = excluded.forwarder_id,
          booking_number = excluded.booking_number,
          container_number = excluded.container_number,
          shipping_line = excluded.shipping_line,
          pol = excluded.pol,
          pod = excluded.pod,
          updated_at = now();
  end if;

  return new;
end;
$$ language plpgsql;

-- Backfill: the trigger above only fires on a NEW insert/update of
-- container_no, so any tracking row that already had a forwarder
-- assigned before this migration ran would otherwise never get an
-- invoice shell. One-time catch-up, safe to re-run (no-op once every
-- eligible tracking row has one).
insert into forwarder_invoices (company_id, forwarder_id, tracking_id, booking_number, container_number, shipping_line, pol, pod)
select t.company_id, t.forwarder_id, t.id, t.booking_number, t.container_number, t.shipping_line, b.pol, b.pod
from tracking t
join bookings b on b.id = t.booking_id
where t.forwarder_id is not null
on conflict (tracking_id) do nothing;
