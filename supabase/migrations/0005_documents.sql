-- ============================================================
-- BOOKPORT · Document generation
-- RECONSTRUCTED — see the note at the bottom of 0003 for why.
-- ============================================================

alter table tracking add column if not exists seal_number text;
alter table tracking add column if not exists packing_list_file_path text;

-- Versioned: every PDF generation is a new row, never overwritten,
-- so a wrongly-generated invoice can be regenerated without losing
-- the record of the mistake.
create table if not exists generated_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  tracking_id uuid not null references tracking(id),
  doc_type text not null,
  field_data jsonb not null,
  pdf_path text,
  version int not null default 1,
  created_at timestamptz default now()
);

alter table generated_documents enable row level security;

drop policy if exists generated_documents_company_isolation on generated_documents;
create policy generated_documents_company_isolation on generated_documents
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- Default Final Invoice template, company-scoped so onboarding a new
-- client's own letterhead/style is "insert a row," not "write code."
-- template_config is a placeholder here — replace with the real
-- letterhead config if this ever runs against a fresh database.
insert into document_templates (company_id, doc_type, template_config, is_default)
select '00000000-0000-0000-0000-000000000001', 'final_invoice', '{}'::jsonb, true
where not exists (
  select 1 from document_templates
  where company_id = '00000000-0000-0000-0000-000000000001' and doc_type = 'final_invoice'
);
