-- ============================================================
-- BOOKPORT · Fumigation Certificate / Certificate of Origin templates
--
-- Widens the doc_type check constraints (same gap pattern as 0023) to
-- cover two new generated document types, and seeds their
-- document_templates rows so generation works immediately without
-- requiring a Settings save first.
--
-- certificate_of_origin reuses the company's OWN letterhead (same
-- company_name/address_lines as final_invoice/booking_instruction - it's
-- the exporter named on the certificate), so it's copied from the
-- existing final_invoice row, plus two COO-specific fields
-- (trade_association, place) that LetterheadSettingsCard doesn't manage
-- yet. fumigation_certificate is DIFFERENT on purpose - it's a real
-- third-party fumigator's own certificate (Tanishq's company doesn't
-- issue it), so it gets its own fixed company_name/address, entirely
-- separate from the company's own letterhead settings.
-- ============================================================

alter table document_templates drop constraint if exists document_templates_doc_type_check;
alter table document_templates add constraint document_templates_doc_type_check
  check (doc_type in ('final_invoice', 'booking_instruction', 'certificate_of_origin', 'fumigation_certificate'));

alter table generated_documents drop constraint if exists generated_documents_doc_type_check;
alter table generated_documents add constraint generated_documents_doc_type_check
  check (doc_type in ('final_invoice', 'booking_instruction', 'certificate_of_origin', 'fumigation_certificate'));

insert into document_templates (company_id, doc_type, template_config, is_default)
select company_id, 'certificate_of_origin', template_config || '{"trade_association": "US CHAMBER OF COMMERCE", "place": "NEW YORK, USA"}'::jsonb, true
from document_templates
where doc_type = 'final_invoice'
  and not exists (
    select 1 from document_templates dt2
    where dt2.company_id = document_templates.company_id and dt2.doc_type = 'certificate_of_origin'
  );

insert into document_templates (company_id, doc_type, template_config, is_default)
select '00000000-0000-0000-0000-000000000001', 'fumigation_certificate', '{
  "company_name": "INTERNATIONAL FUMIGATORS, INC.",
  "address_lines": ["P.O BOX 263550", "HOUSTON, TAXAS"]
}'::jsonb, true
where not exists (
  select 1 from document_templates
  where company_id = '00000000-0000-0000-0000-000000000001' and doc_type = 'fumigation_certificate'
);
