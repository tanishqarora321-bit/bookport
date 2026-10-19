-- ============================================================
-- BOOKPORT · Collapse buyer_gst_entries to one record per buyer
--
-- buyer_gst_entries (migration 0023) was built for a buyer "group"
-- shipping under several different legal entity names, each picked
-- explicitly per booking via bookings.consignee_gst_entry_id. In
-- practice that's not how Buyers & Customers is actually used - every
-- real buyer record already corresponds to exactly one legal entity
-- (checked live: 0 buyers have more than one GST entry today, out of 7
-- total). So this becomes the buyer's own GST/IEC/PAN/shipping-details
-- record instead of a pickable list - one per buyer, always.
-- ============================================================

create unique index if not exists buyer_gst_entries_buyer_party_id_key
  on buyer_gst_entries (buyer_party_id);

-- No longer needed - with exactly one entry per buyer, there's nothing
-- left to disambiguate per booking once a buyer is assigned (checked
-- live: the 3 bookings that had this set all point to their buyer's
-- one-and-only entry anyway, so nothing is lost). The instructions
-- email now looks the entry up directly via the booking's buyer.
alter table bookings drop column if exists consignee_gst_entry_id;

-- merge_parties() (migration 0019) never actually moved buyer_gst_entries
-- rows onto the surviving party - the losing party's row just got
-- cascade-deleted when its party row was deleted. That was a minor gap
-- before (one of several GST entries quietly disappearing); now that
-- it's a buyer's single shipping-details record, losing it silently on
-- a routine merge is a bigger deal. Repoint it onto the surviving party
-- when that party doesn't already have one of its own (the new unique
-- index means it can't just blindly repoint - if the keeper already has
-- a record, its own data wins, same as legal_name/short_code/etc.
-- already do by default unless "use other's details" was picked).
create or replace function merge_parties(
  p_keep_id uuid,
  p_merge_id uuid,
  p_legal_name text,
  p_short_code text,
  p_country text,
  p_address text
) returns void as $$
declare
  v_keep_roles text[];
  v_merge_roles text[];
begin
  if p_keep_id = p_merge_id then
    raise exception 'Cannot merge a party with itself';
  end if;

  select roles into v_keep_roles from parties where id = p_keep_id;
  select roles into v_merge_roles from parties where id = p_merge_id;
  if v_keep_roles is null or v_merge_roles is null then
    raise exception 'One or both parties not found';
  end if;

  with conflicts as (
    select
      fi_merge.id as merge_row_id,
      fi_keep.id as keep_row_id,
      (fi_keep.invoice_number is not null
        or (fi_merge.invoice_number is null and fi_keep.total >= fi_merge.total)) as keep_wins
    from forwarder_invoices fi_merge
    join forwarder_invoices fi_keep
      on fi_keep.forwarder_id = p_keep_id
     and fi_keep.tracking_id = fi_merge.tracking_id
    where fi_merge.forwarder_id = p_merge_id
      and fi_merge.tracking_id is not null
  )
  delete from forwarder_invoices
  where id in (
    select case when keep_wins then merge_row_id else keep_row_id end from conflicts
  );

  update forwarder_invoices set forwarder_id = p_keep_id where forwarder_id = p_merge_id;
  update forwarder_invoices set consignee_party_id = p_keep_id where consignee_party_id = p_merge_id;
  update trucker_invoices set trucker_id = p_keep_id where trucker_id = p_merge_id;
  update supplier_invoices set supplier_id = p_keep_id where supplier_id = p_merge_id;
  update rate_sheets set forwarder_id = p_keep_id where forwarder_id = p_merge_id;

  update party_contacts set party_id = p_keep_id where party_id = p_merge_id;
  update booking_parties set party_id = p_keep_id where party_id = p_merge_id;
  update tracking set forwarder_id = p_keep_id where forwarder_id = p_merge_id;
  update tracking set party_id = p_keep_id where party_id = p_merge_id;
  update trucking_jobs set trucker_party_id = p_keep_id where trucker_party_id = p_merge_id;
  update rate_quotes set forwarder_party_id = p_keep_id where forwarder_party_id = p_merge_id;
  update offers set buyer_party_id = p_keep_id where buyer_party_id = p_merge_id;
  update charges set counterparty_id = p_keep_id where counterparty_id = p_merge_id;
  update invoices set party_id = p_keep_id where party_id = p_merge_id;

  update buyer_gst_entries
    set buyer_party_id = p_keep_id
    where buyer_party_id = p_merge_id
      and not exists (select 1 from buyer_gst_entries where buyer_party_id = p_keep_id);

  delete from booking_parties bp
  where bp.party_id = p_keep_id
    and bp.ctid not in (
      select min(bp2.ctid)
      from booking_parties bp2
      where bp2.party_id = p_keep_id
      group by bp2.booking_id, bp2.role
    );

  update parties
    set legal_name = p_legal_name,
        short_code = p_short_code,
        country = p_country,
        address = p_address,
        roles = (select array(select distinct unnest(v_keep_roles || v_merge_roles)))
    where id = p_keep_id;

  delete from parties where id = p_merge_id;
end;
$$ language plpgsql;
