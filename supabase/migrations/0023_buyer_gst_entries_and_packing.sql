-- ============================================================
-- BOOKPORT · Buyer GST entries, per-container packing details,
-- Consignee-as-per-BL, and a real company letterhead template
--
-- Buyers/Customers so far has been one flat `parties` row per company.
-- In practice one real buyer "group" (tracked as a single P&L party,
-- e.g. "MANAN SINGLA") ships under SEVERAL different legal entity names
-- (BALAJI INTERNATIONAL, SHREE SAI SPINNERS, SRI BALAJI OVERSEAS - each
-- with its own GST/IEC/address), and a shipping document needs the
-- exact legal entity, not the P&L group name. buyer_gst_entries is the
-- child table for that - same one-buyer-many-entries shape as
-- supplier_invoice_items is one-invoice-many-lines.
-- ============================================================

create table if not exists buyer_gst_entries (
  id uuid primary key default gen_random_uuid(),
  buyer_party_id uuid not null references parties(id) on delete cascade,
  legal_name text not null,
  gst_no text,
  iec_code text,
  address text,
  mobile text,
  email text,
  description_of_goods text,
  hs_code text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table buyer_gst_entries enable row level security;

drop policy if exists buyer_gst_entries_company_isolation on buyer_gst_entries;
create policy buyer_gst_entries_company_isolation on buyer_gst_entries
  for all using (
    buyer_party_id in (select id from parties where company_id = current_company_id())
  )
  with check (
    buyer_party_id in (select id from parties where company_id = current_company_id())
  );

-- Which specific GST entry a booking's shipping documents should name -
-- picked explicitly per booking (not auto-inferred), since the real BL
-- must name one specific legal entity and a buyer can have several.
alter table bookings add column if not exists consignee_gst_entry_id uuid references buyer_gst_entries(id);

-- Per-container packing details (Seal No / Weight / Weight Unit / Bales),
-- "treated as a cost section" per spec - a container can have more than
-- one line (e.g. a consolidated container with mixed cargo), each
-- optionally re-stating its own seal if it was re-sealed. containers.seal_no
-- (the single pre-existing column) is left as-is and untouched; this is
-- additive, not a replacement.
create table if not exists container_packing_items (
  id uuid primary key default gen_random_uuid(),
  container_id uuid not null references containers(id) on delete cascade,
  seal_no text,
  weight numeric,
  weight_unit text not null default 'LBS' check (weight_unit in ('LBS', 'KG')),
  bales int,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table container_packing_items enable row level security;

drop policy if exists container_packing_items_company_isolation on container_packing_items;
create policy container_packing_items_company_isolation on container_packing_items
  for all using (
    container_id in (
      select c.id from containers c join bookings b on b.id = c.booking_id
      where b.company_id = current_company_id()
    )
  )
  with check (
    container_id in (
      select c.id from containers c join bookings b on b.id = c.booking_id
      where b.company_id = current_company_id()
    )
  );

-- Real letterhead for the existing Final Invoice template (was seeded as
-- an empty '{}' placeholder in 0005) and a second template row for the
-- new "booking_instruction" doc type (Generate Instructions PDF) -
-- same company_id-scoped, Settings-editable row-not-code pattern.
update document_templates
set template_config = '{
  "company_name": "CN INTERNATIONAL USA INC.",
  "address_lines": ["137 Friendship Ct", "White Plains, NY 10603"],
  "phone": "646.932.4426",
  "fax": "914.517.1393",
  "email": "nitinsingla@gmail.com",
  "accent_color": "#0f172a"
}'::jsonb
where company_id = '00000000-0000-0000-0000-000000000001'
  and doc_type = 'final_invoice'
  and template_config = '{}'::jsonb;

-- shipper_declaration has a {destination} placeholder the PDF fills in
-- per booking - exact wording is a stand-in copied from the general
-- shape of a standard shipper's letter of instruction; Tanishq should
-- correct it against the real letter (image 4) from Settings once he
-- compares, no code change needed either way.
insert into document_templates (company_id, doc_type, template_config, is_default)
select '00000000-0000-0000-0000-000000000001', 'booking_instruction', '{
  "company_name": "CN INTERNATIONAL USA INC.",
  "address_lines": ["137 Friendship Ct", "White Plains, NY 10603"],
  "phone": "646.932.4426",
  "fax": "914.517.1393",
  "email": "nitinsingla@gmail.com",
  "accent_color": "#0f172a",
  "shipper_declaration": "SHIPPER DECLARES THAT THE ABOVE PARTICULARS ARE TRUE AND CORRECT AND THAT THIS SHIPMENT DOES NOT CONTAIN ANY HAZARDOUS OR DANGEROUS GOODS, AND IS DESTINED FOR {destination}."
}'::jsonb, true
where not exists (
  select 1 from document_templates
  where company_id = '00000000-0000-0000-0000-000000000001' and doc_type = 'booking_instruction'
);

-- generated_documents was built tracking_id-only (0005) because every
-- doc type so far rendered from a tracking row. "Generate Instructions"
-- renders straight from a booking/container instead, so tracking_id has
-- to become optional and booking_id joins it as the alternative anchor -
-- additive, every existing final_invoice row already has tracking_id set.
alter table generated_documents alter column tracking_id drop not null;
alter table generated_documents add column if not exists booking_id uuid references bookings(id);
alter table generated_documents drop constraint if exists generated_documents_has_anchor;
alter table generated_documents add constraint generated_documents_has_anchor
  check (tracking_id is not null or booking_id is not null);
