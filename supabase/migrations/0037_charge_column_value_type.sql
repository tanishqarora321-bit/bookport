-- ============================================================
-- BOOKPORT · Text/string type for custom charge columns
--
-- forwarder_invoice_custom_columns / trucker_invoice_custom_columns
-- (0016/0022) only ever supported numeric charges. Adding value_type so
-- a column can instead hold a reference number, a note, or any other
-- non-numeric value - stored the same way (one key in the invoice's
-- custom_charges jsonb), just read/written as a string instead of being
-- forced through parseNumeric()/Number(), and excluded from the invoice
-- total math (a text column isn't a charge amount).
--
-- Suppliers deliberately does NOT get this same custom-columns feature -
-- its invoices already support unlimited, freely-named line items via
-- supplier_invoice_items (description/weight/unit price/amount per
-- line), which is strictly more flexible than a capped set of named
-- columns, not less. Building a parallel system there would be a step
-- backwards, not the same functionality "as we do in the forwarders".
-- ============================================================

alter table forwarder_invoice_custom_columns add column if not exists value_type text not null default 'number' check (value_type in ('number', 'text'));
alter table trucker_invoice_custom_columns add column if not exists value_type text not null default 'number' check (value_type in ('number', 'text'));
