-- ============================================================
-- BOOKPORT · Merge two duplicate party records into one
--
-- E.g. "WALKER" and "Walker International Transportation" turning
-- out to be the same real company entered twice (once via quick-add,
-- once via Excel import). Done as one atomic SQL function rather than
-- several separate API calls, since a merge touches a dozen tables -
-- a partial failure halfway through would leave bookings/invoices
-- split across two "different" companies, which is worse than not
-- merging at all.
--
-- Repoints every known FK to parties.id from the losing party onto
-- the surviving one, unions their `roles` (a party kept as Forwarder
-- on one row and Buyer on the other keeps both after merging), then
-- deletes the losing row. Generic by design (not forwarder-specific) -
-- the same function can back a Trucker/Supplier/Buyer merge UI later
-- with no schema change.
-- ============================================================

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

  -- forwarder_invoices.tracking_id has a partial unique index (one
  -- invoice per tracking row) - if BOTH parties already have an
  -- invoice for the same tracking_id, repointing forwarder_id would
  -- violate it. Pick a winner per conflicting pair (prefer whichever
  -- already has an invoice_number i.e. is further along, else the
  -- higher total) and delete the loser before repointing.
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

  -- Collapse exact duplicate booking_parties rows that can now exist
  -- (both parties independently assigned to the same booking+role
  -- before the merge) down to one per (booking_id, role).
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
