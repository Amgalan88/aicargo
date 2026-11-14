-- enable-rls.sql-ийн буцаалт. Нэг удаа ажиллуулна. Дахин ажиллуулахад өөрчлөлт хийхгүй, алдаа өгнө.
--   npx tsx --env-file=.env.local scripts/rollback-rls.ts
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/sql/rollback-rls.sql
--
-- Disables RLS on every non-extension public table and grants anon/authenticated
-- the privileges this script previously revoked (Supabase's historical default of
-- ALL on tables and sequences, plus EXECUTE for PUBLIC on functions).
-- service_role is not modified.
-- Also drops aicargo_rls_guard, so later tables are no longer locked automatically.
-- scripts/loyalty-ddl.ts turns RLS back on for its five tables only; re-run
--   npx tsx --env-file=.env.local scripts/add-loyalty.ts
-- if those tables should keep RLS after this undo. That script does not re-grant.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'aicargo_rls_guard') THEN
    RAISE EXCEPTION 'aicargo_rls_guard is not installed; rollback made no changes. Run it only after scripts/sql/enable-rls.sql.';
  END IF;
END $$;

DROP EVENT TRIGGER IF EXISTS aicargo_rls_guard;
DROP FUNCTION IF EXISTS rls_guard.auto_enable();
DROP SCHEMA IF EXISTS rls_guard;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'f')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated', r.relname);
  END LOOP;

  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO anon, authenticated', r.relname);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE 'GRANT ALL ON FUNCTION ' || r.sig::text || ' TO PUBLIC, anon, authenticated';
  END LOOP;

  FOR r IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    IF r.relkind = 'v' AND current_setting('server_version_num')::int >= 150000 THEN
      EXECUTE format('ALTER VIEW public.%I RESET (security_invoker)', r.relname);
    END IF;
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated', r.relname);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO PUBLIC, anon, authenticated;
