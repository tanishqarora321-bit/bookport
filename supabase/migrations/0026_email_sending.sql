-- ============================================================
-- BOOKPORT · Email sending (Resend) - company-scoped settings + a log
--
-- "Generate Instructions" was wrong per Tanishq's real example: the
-- booking instructions go out as an EMAIL body to the carrier/forwarder,
-- never a PDF attachment. This is the infrastructure for that, built
-- generically ("we need to mail some more things also in the future")
-- rather than Instructions-only: one settings row per company (each
-- client brings their own Resend account/domain, same company-scoped,
-- Settings-editable pattern as document_templates) and one log table
-- any future email type can write to.
-- ============================================================

create table if not exists company_email_settings (
  company_id uuid primary key references companies(id),
  provider text not null default 'resend',
  api_key text,
  from_email text,
  from_name text,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table company_email_settings enable row level security;

drop policy if exists company_email_settings_company_isolation on company_email_settings;
create policy company_email_settings_company_isolation on company_email_settings
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- Generic send log - any future email type (buyer statements, overdue
-- reminders, etc.) logs here too, not just booking instructions, so
-- booking_id/email_type are nullable/free-text rather than instructions-
-- specific columns.
create table if not exists sent_emails (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  booking_id uuid references bookings(id),
  email_type text not null default 'other',
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text,
  body_html text,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error_message text,
  provider_message_id text,
  created_at timestamptz not null default now()
);

alter table sent_emails enable row level security;

drop policy if exists sent_emails_company_isolation on sent_emails;
create policy sent_emails_company_isolation on sent_emails
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- The real example's "SHIPPER DECLARES" clause names a specific transit
-- destination WITH its UN/LOCODE in parens ("KANDLA SPECIAL ECONOMIC
-- ZONE (INKDL6)") - that's a property of the consignee/GST entity
-- (where THIS buyer's cargo transits to), not the generic booking
-- Port of Delivery, so it lives on buyer_gst_entries, editable per
-- entity same as description_of_goods/hs_code.
alter table buyer_gst_entries add column if not exists transit_destination text;

-- The real instructions email also prints a PAN number alongside GST/IEC
-- ("GST NO. ... IEC NO. ... ,PAN NO. ...") - missing from 0023's original
-- GST entry fields entirely.
alter table buyer_gst_entries add column if not exists pan_no text;
