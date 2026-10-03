-- ============================================================
-- BOOKPORT · Reattach orphaned forwarder invoices instead of duplicating
--
-- Deleting a booking (or a full test wipe) detaches its
-- forwarder_invoices rows (tracking_id = null) rather than deleting
-- them, specifically so real invoice data/history survives a booking
-- being removed. But re-creating the same booking/container later
-- (e.g. re-importing the same Excel file after a wipe) had no way to
-- find that orphaned row again - the trigger always inserted a brand
-- new one, so the orphaned original just sat there looking like a
-- confusing duplicate next to the fresh empty shell. Confirmed live:
-- SPEEDEX's booking 6508455370/SEKU4363899 had exactly this - a real
-- $8,685 invoice (orphaned) sitting next to a brand new $0 pending
-- shell for what was, in reality, the same shipment.
--
-- Now: before creating a new shell, look for an orphaned one that
-- matches this forwarder + booking number + container number, and
-- reattach it (keeping whatever invoice data it already has) instead
-- of creating a new row.
-- ============================================================

create or replace function sync_container_to_tracking()
returns trigger as $$
declare
  v_booking record;
  v_forwarder_id uuid;
  v_buyer_id uuid;
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

  return new;
end;
$$ language plpgsql;
