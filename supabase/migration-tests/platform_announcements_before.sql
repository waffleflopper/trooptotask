CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users(id,email) VALUES ('e8690000-0000-4000-8000-000000000901','banner-before@example.test');
INSERT INTO public.platform_announcements(id,title,message,type,is_active,created_by) VALUES
 ('e8690000-0000-4000-8000-000000000902','Banner before upgrade','Saved before server-only writes','maintenance',true,'e8690000-0000-4000-8000-000000000901');
INSERT INTO public.announcement_dismissals(announcement_id,user_id) VALUES
 ('e8690000-0000-4000-8000-000000000902','e8690000-0000-4000-8000-000000000901');
CREATE TABLE upgrade_fixture.platform_announcements_before AS
 SELECT id,title,message,type,is_active,expires_at,created_by FROM public.platform_announcements
 WHERE id='e8690000-0000-4000-8000-000000000902';
CREATE TABLE upgrade_fixture.platform_announcements_baseline AS SELECT
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261025110100') migration_absent,
 to_regclass('public.whats_new_entries') IS NULL entries_absent;
