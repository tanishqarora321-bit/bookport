-- ============================================================
-- BOOKPORT · Wire up single-device-login enforcement
--
-- `active_sessions` was scaffolded in migration 0003 (RLS enabled,
-- never given a policy - meaning it was unreadable to anyone but the
-- service role) for exactly this: only one signed-in device per
-- account at a time. Adds the missing policy so middleware.ts can
-- read (as the signed-in user, via the anon-key client) whether the
-- request's session cookie still matches the most recently
-- registered device.
-- ============================================================

drop policy if exists active_sessions_self on active_sessions;
create policy active_sessions_self on active_sessions for select using (user_id = auth.uid());
