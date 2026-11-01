-- Enable Row Level Security on every public table (Supabase advisor: rls_disabled_in_public).
-- The app never uses supabase-js / the anon key: all DB access is server-side via Prisma
-- (DATABASE_URL, role "postgres", table owner + BYPASSRLS), so no policies are needed.
-- With RLS on and no policies, PostgREST (anon/authenticated) gets zero rows / write denied.
-- Idempotent; safe to re-run.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    -- Defense in depth: anon/authenticated never need direct table access.
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;

-- Future tables created by postgres in public: no default grants to API roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
