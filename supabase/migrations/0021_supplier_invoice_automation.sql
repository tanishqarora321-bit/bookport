-- ============================================================
-- BOOKPORT · Auto-create a supplier invoice shell from tracking
--
-- sync_container_to_tracking() already auto-creates a pending
-- forwarder_invoices row the moment a container exists with a forwarder
-- assigned (0015), reattaching an orphaned one instead of duplicating
-- (0018). Suppliers never got the same treatment - assigning a supplier
-- to a booking in Booking & Instructions did nothing until someone
-- manually clicked "+ Add Invoice", unlike the Forwarders experience the
-- rest of this module was just built to match. This extends the same
-- trigger to do the same thing for suppliers.
-- ============================================================

-- One invoice shell per tracking row, same reasoning as
-- forwarder_invoices_tracking_id_key - also means a booking's supplier
-- being reassigned (A -> B) moves the same shell rather than creating a
-- second one, matching forwarder_invoices' documented trade-off.
create unique index if not exists supplier_invoices_tracking_id_key
  on supplier_invoices (tracking_id)
  where tracking_id is not null;

create or replace function sync_container_to_tracking()
returns trigger as $$
declare
  v_booking record;
  v_forwarder_id uuid;
  v_forwarder_name text;
  v_buyer_id uuid;
  v_supplier_id uuid;
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

  return new;
end;
$$ language plpgsql;
