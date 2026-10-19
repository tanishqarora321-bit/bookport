-- ============================================================
-- BOOKPORT · Set of Documents template (Commercial Invoice + Packing
-- List + short self-issued Fumigation/Origin declarations, 4 pages)
--
-- Same pattern as 0034: widen the doc_type check constraints, seed a
-- template row per company by copying final_invoice's own letterhead,
-- plus bank-wire fields (shown on the Commercial Invoice page) that
-- LetterheadSettingsCard doesn't manage - seeded here from Tanishq's
-- real example so generation works immediately.
-- ============================================================

alter table document_templates drop constraint if exists document_templates_doc_type_check;
alter table document_templates add constraint document_templates_doc_type_check
  check (doc_type in ('final_invoice', 'booking_instruction', 'certificate_of_origin', 'fumigation_certificate', 'set_of_documents'));

alter table generated_documents drop constraint if exists generated_documents_doc_type_check;
alter table generated_documents add constraint generated_documents_doc_type_check
  check (doc_type in ('final_invoice', 'booking_instruction', 'certificate_of_origin', 'fumigation_certificate', 'set_of_documents'));

-- Bank wire details are real financial data - only seed Tanishq's actual
-- account for his own company_id, never copy them onto a different
-- tenant's template. Any other company gets a blank set_of_documents
-- template (same letterhead, no bank fields) to fill in themselves.
insert into document_templates (company_id, doc_type, template_config, is_default)
select
  company_id,
  'set_of_documents',
  case
    when company_id = '00000000-0000-0000-0000-000000000001' then
      template_config || '{
        "bank_name": "FLAGSTAR BANK",
        "bank_account": "1503904833",
        "account_name": "CN INTERNATIONALUSA INC.",
        "swift_code": "SIGNUS33",
        "aba_code": "26013576",
        "bank_address": "360 HAMILTON AVENUE WHITE PLAINS NY 10601 USA"
      }'::jsonb
    else template_config
  end,
  true
from document_templates
where doc_type = 'final_invoice'
  and not exists (
    select 1 from document_templates dt2
    where dt2.company_id = document_templates.company_id and dt2.doc_type = 'set_of_documents'
  );
