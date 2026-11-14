-- Бүх public хүснэгт: RLS (policy нэмэхгүй) + anon/authenticated эрх хасах. Давтан ажиллуулж болно.
-- Apply as the postgres role on the direct connection (port 5432), not the pooler:
--   npx tsx --env-file=.env.local scripts/enable-rls.ts
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/sql/enable-rls.sql
-- Undo (once): scripts/sql/rollback-rls.sql
--
-- The app reads and writes as the table owner through Prisma. Table owners bypass
-- RLS unless FORCE ROW LEVEL SECURITY is set. This script does not force RLS and
-- does not create policies. service_role is left as Supabase defines it (BYPASSRLS).
-- anon/authenticated lose table, sequence, and public-function privileges, so the
-- Data API cannot read or write. Future tables in public get the same treatment
-- from the aicargo_rls_guard event trigger (Supabase lets the postgres role create
-- event triggers) plus default privileges for objects created by postgres.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'anon and authenticated roles are required (Supabase Data API roles)';
  END IF;
END $$;

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
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', r.relname);
  END LOOP;

  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated', r.relname);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || r.sig::text || ' FROM PUBLIC, anon, authenticated';
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
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.relname);
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

CREATE SCHEMA IF NOT EXISTS rls_guard;
REVOKE ALL ON SCHEMA rls_guard FROM PUBLIC;
REVOKE ALL ON SCHEMA rls_guard FROM anon, authenticated;

CREATE OR REPLACE FUNCTION rls_guard.auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $rls$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'CREATE VIEW', 'CREATE MATERIALIZED VIEW', 'CREATE SEQUENCE')
      AND schema_name = 'public'
  LOOP
    IF cmd.object_type IN ('table', 'partitioned table') THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', cmd.object_identity);
      EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', cmd.object_identity);
    ELSIF cmd.object_type = 'view' THEN
      IF current_setting('server_version_num')::int >= 150000 THEN
        EXECUTE format('ALTER VIEW %s SET (security_invoker = true)', cmd.object_identity);
      END IF;
      EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', cmd.object_identity);
    ELSIF cmd.object_type = 'materialized view' THEN
      EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', cmd.object_identity);
    ELSIF cmd.object_type = 'sequence' THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', cmd.object_identity);
    END IF;
  END LOOP;
END
$rls$;

REVOKE ALL ON FUNCTION rls_guard.auto_enable() FROM PUBLIC;

DROP EVENT TRIGGER IF EXISTS aicargo_rls_guard;
CREATE EVENT TRIGGER aicargo_rls_guard
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'CREATE VIEW', 'CREATE MATERIALIZED VIEW', 'CREATE SEQUENCE')
  EXECUTE FUNCTION rls_guard.auto_enable();

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e');
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'RLS still off for public tables: %', missing;
  END IF;
END $$;
