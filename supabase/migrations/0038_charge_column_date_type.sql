-- ============================================================
-- BOOKPORT · Date type for custom charge columns
--
-- forwarder_invoice_custom_columns / trucker_invoice_custom_columns
-- (0016/0022) already support 'number' and 'text' value_type (0037).
-- Adding 'date' as a third option, for columns like a port-storage
-- release date or a reference date that isn't a charge amount and
-- isn't free text either - stored as a plain date string (same
-- convention as invoice_date/invoice_due_date), excluded from the
-- invoice total math same as 'text' already is.
--
-- The existing CHECK constraint from 0037 can't be widened in place -
-- Postgres requires dropping and re-adding a CHECK constraint to
-- change its definition. Found dynamically by column rather than by a
-- guessed/hardcoded constraint name, so this doesn't depend on exactly
-- how Postgres auto-named it when 0037 ran.
-- ============================================================

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'forwarder_invoice_custom_columns'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%value_type%'
  loop
    execute format('alter table forwarder_invoice_custom_columns drop constraint %I', c.conname);
  end loop;

  for c in
    select conname
    from pg_constraint
    where conrelid = 'trucker_invoice_custom_columns'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%value_type%'
  loop
    execute format('alter table trucker_invoice_custom_columns drop constraint %I', c.conname);
  end loop;
end $$;

alter table forwarder_invoice_custom_columns add constraint forwarder_invoice_custom_columns_value_type_check check (value_type in ('number', 'text', 'date'));
alter table trucker_invoice_custom_columns add constraint trucker_invoice_custom_columns_value_type_check check (value_type in ('number', 'text', 'date'));
