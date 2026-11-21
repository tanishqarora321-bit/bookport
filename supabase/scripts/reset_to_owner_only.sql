-- ============================================================
-- SHIP-SPHERE · ONE-TIME RESET: wipe everything, keep only the owner
-- (owner request, 2026-11-21)
--
-- !!! THIS PERMANENTLY DELETES ALL DATA. IT CANNOT BE UNDONE. !!!
-- Take a backup first (Supabase -> Database -> Backups) if there is
-- anything you might want back.
--
-- After it runs, the database holds:
--   * ONE login: tanishqarora321@gmail.com (admin)
--   * ONE company: "Ship-Sphere" (the platform-owner company,
--     id 00000000-0000-0000-0000-000000000001 - the app treats this id as
--     the owner, so it is kept and renamed, not recreated)
--   * that company's settings (letterhead / document templates, email
--     settings, offer-sheet types, custom invoice columns)
--   * the built-in lookup lists (ports, currencies, charge heads, cut-off
--     label aliases)
-- Everything else is deleted: every other login, every other company, and
-- ALL bookings, containers, tracking, parties (buyers / forwarders /
-- truckers / suppliers), invoices, payments, documents, rate sheets,
-- commission bookings, P&L entries, sent-email log, etc.
--
-- Uploaded PDFs live in Storage, not in these tables: empty them in
-- Supabase -> Storage -> "documents" -> select all -> Delete.
--
-- Not in supabase/migrations/ on purpose: it is never run automatically.
-- ============================================================

do $$
declare
  owner_email constant text := 'tanishqarora321@gmail.com';
  owner_company constant uuid := '00000000-0000-0000-0000-000000000001';
  owner_id uuid;
  -- kept as-is
  keep_all text[] := array['companies','profiles','ports','currencies','charge_heads','cutoff_label_aliases'];
  -- kept for the owner company only
  keep_own text[] := array['document_templates','company_email_settings','offer_sheet_types','forwarder_invoice_custom_columns','trucker_invoice_custom_columns'];
  t text;
  remaining text[];
  pass int := 0;
  failed text[];
begin
  select id into owner_id from auth.users where lower(email) = owner_email;
  if owner_id is null then
    raise exception 'Stopped: no login found for % - nothing was deleted.', owner_email;
  end if;
  if not exists (select 1 from companies where id = owner_company) then
    raise exception 'Stopped: the owner company row is missing - nothing was deleted.';
  end if;

  -- The owner becomes the admin of the Ship-Sphere company.
  update companies set name = 'Ship-Sphere' where id = owner_company;
  update profiles set company_id = owner_company, role = 'admin', is_active = true where id = owner_id;
  if not found then
    insert into profiles (id, full_name, role, company_id, is_active) values (owner_id, 'Tanishq', 'admin', owner_company, true);
  end if;
  begin
    execute 'update profiles set party_id = null';
  exception when undefined_column then null;
  end;

  -- Wipe every other table. Tables reference each other, so keep going
  -- round until all are empty (a delete blocked by a reference simply
  -- succeeds on a later pass once the referencing table is empty).
  select array_agg(tablename::text) into remaining
  from pg_tables where schemaname = 'public' and not (tablename = any (keep_all));
  loop
    pass := pass + 1;
    failed := '{}';
    foreach t in array remaining loop
      begin
        if t = any (keep_own) then
          execute format('delete from public.%I where company_id is distinct from %L', t, owner_company);
        else
          execute format('delete from public.%I', t);
        end if;
      exception when foreign_key_violation then
        failed := failed || t;
      end;
    end loop;
    exit when cardinality(failed) = 0;
    if pass > 25 then
      raise exception 'Stopped: could not clear % (references in a loop) - everything rolled back.', failed;
    end if;
    remaining := failed;
  end loop;

  -- Other companies' users, then other companies, then other logins.
  delete from profiles where id <> owner_id;
  delete from companies where id <> owner_company;
  delete from auth.users where id <> owner_id;

  raise notice 'Done: only % and company Ship-Sphere remain.', owner_email;
end $$;

-- CHECK afterwards (expect 1 / 1 / 1 and the owner email):
--   select count(*) from auth.users;
--   select count(*) from companies;
--   select count(*) from profiles;
--   select email from auth.users;
