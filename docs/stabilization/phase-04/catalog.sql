-- D01 / 04-01b-01: metadata only, on a newly created disposable replay.
-- Execute with psql -X -qAt -v ON_ERROR_STOP=1. Never run on an existing stack.
-- Object identities are readable; internal FK trigger names contain replay OIDs.
BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog;
WITH public_relations AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
), owned_objects AS (
  SELECT 'pg_class'::regclass AS classid, oid AS objid FROM public_relations
  UNION ALL SELECT 'pg_proc'::regclass, oid FROM pg_proc WHERE pronamespace = 'public'::regnamespace
  UNION ALL SELECT 'pg_type'::regclass, oid FROM pg_type WHERE typnamespace = 'public'::regnamespace
  UNION ALL SELECT 'pg_constraint'::regclass, oid FROM pg_constraint WHERE connamespace = 'public'::regnamespace
  UNION ALL SELECT 'pg_trigger'::regclass, oid FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM public_relations)
  UNION ALL SELECT 'pg_policy'::regclass, oid FROM pg_policy WHERE polrelid IN (SELECT oid FROM public_relations)
  UNION ALL SELECT 'pg_rewrite'::regclass, oid FROM pg_rewrite WHERE ev_class IN (SELECT oid FROM public_relations)
  UNION ALL SELECT 'pg_attrdef'::regclass, oid FROM pg_attrdef WHERE adrelid IN (SELECT oid FROM public_relations)
), entries AS (
  SELECT 'relations' AS section, jsonb_build_object(
    'identity', c.oid::regclass::text, 'kind', c.relkind, 'rls', c.relrowsecurity,
    'force_rls', c.relforcerowsecurity, 'owner', pg_get_userbyid(c.relowner),
    'acl', c.relacl, 'options', c.reloptions,
    'view_definition', CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid, true) END
  ) AS item FROM pg_class c WHERE c.oid IN (SELECT oid FROM public_relations)
  UNION ALL
  SELECT 'columns', jsonb_build_object(
    'relation', a.attrelid::regclass::text, 'name', a.attname, 'position', a.attnum,
    'type', format_type(a.atttypid,a.atttypmod), 'not_null', a.attnotnull,
    'identity', a.attidentity, 'generated', a.attgenerated, 'acl', a.attacl,
    'default', pg_get_expr(d.adbin, d.adrelid)
  ) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  JOIN pg_class c ON c.oid = a.attrelid
  WHERE a.attrelid IN (SELECT oid FROM public_relations) AND a.attnum > 0 AND NOT a.attisdropped
    AND c.relkind IN ('r','p','v','m','f')
  UNION ALL
  SELECT 'functions', jsonb_build_object(
    'identity', p.oid::regprocedure::text, 'language', l.lanname,
    'owner', pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'config', p.proconfig, 'acl', p.proacl,
    'definition', pg_get_functiondef(p.oid)
  ) FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
  WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p','w')
  UNION ALL
  SELECT 'constraints', jsonb_build_object(
    'identity', pg_describe_object('pg_constraint'::regclass,c.oid,0),
    'relation', c.conrelid::regclass::text, 'referenced_relation', NULLIF(c.confrelid,0)::regclass::text,
    'kind', c.contype, 'validated', c.convalidated, 'definition', pg_get_constraintdef(c.oid,true)
  ) FROM pg_constraint c WHERE c.connamespace = 'public'::regnamespace
    OR c.confrelid IN (SELECT oid FROM public_relations)
  UNION ALL
  SELECT 'indexes', jsonb_build_object(
    'identity', i.indexrelid::regclass::text, 'relation', i.indrelid::regclass::text,
    'valid', i.indisvalid, 'definition', pg_get_indexdef(i.indexrelid)
  ) FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM public_relations)
  UNION ALL
  SELECT 'triggers', jsonb_build_object(
    'relation', t.tgrelid::regclass::text, 'name', t.tgname, 'internal', t.tgisinternal,
    'enabled', t.tgenabled, 'function', t.tgfoid::regprocedure::text,
    'definition', pg_get_triggerdef(t.oid,true)
  ) FROM pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM public_relations)
    OR t.tgfoid IN (SELECT oid FROM pg_proc WHERE pronamespace = 'public'::regnamespace)
  UNION ALL
  SELECT 'policies', jsonb_build_object(
    'relation', p.polrelid::regclass::text, 'name', p.polname, 'command', p.polcmd,
    'permissive', p.polpermissive,
    'roles', (SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY r)
              FROM unnest(p.polroles) r),
    'using', pg_get_expr(p.polqual,p.polrelid), 'check', pg_get_expr(p.polwithcheck,p.polrelid)
  ) FROM pg_policy p WHERE p.polrelid IN (SELECT oid FROM public_relations)
  UNION ALL
  SELECT 'types', jsonb_build_object(
    'identity', t.oid::regtype::text, 'kind', t.typtype, 'acl', t.typacl,
    'base', NULLIF(t.typbasetype,0)::regtype::text,
    'enum_values', (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid)
  ) FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace
  UNION ALL
  SELECT 'dependencies', jsonb_build_object(
    'dependent', pg_describe_object(d.classid,d.objid,d.objsubid),
    'referenced', pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid), 'kind', d.deptype
  ) FROM pg_depend d WHERE EXISTS (
    SELECT 1 FROM owned_objects o WHERE (o.classid=d.classid AND o.objid=d.objid)
      OR (o.classid=d.refclassid AND o.objid=d.refobjid))
  UNION ALL
  SELECT 'role_dependencies', jsonb_build_object(
    'dependent', pg_describe_object(d.classid,d.objid,d.objsubid),
    'role', pg_get_userbyid(d.refobjid), 'kind', d.deptype
  ) FROM pg_shdepend d WHERE d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
    AND d.refclassid='pg_authid'::regclass AND EXISTS (
      SELECT 1 FROM owned_objects o WHERE o.classid=d.classid AND o.objid=d.objid)
  UNION ALL
  SELECT 'default_acls', jsonb_build_object(
    'owner', pg_get_userbyid(d.defaclrole), 'schema', n.nspname,
    'object_kind', d.defaclobjtype, 'acl', d.defaclacl
  ) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
  UNION ALL
  SELECT 'schema_acls', jsonb_build_object('schema', n.nspname, 'owner', pg_get_userbyid(n.nspowner), 'acl', n.nspacl)
  FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
  UNION ALL
  SELECT 'function_execute', jsonb_build_object(
    'identity', p.oid::regprocedure::text, 'role', r.rolname,
    'allowed', has_function_privilege(r.oid,p.oid,'EXECUTE')
  ) FROM pg_proc p CROSS JOIN pg_roles r
  WHERE p.pronamespace='public'::regnamespace AND r.rolname IN ('anon','authenticated','service_role')
  UNION ALL
  SELECT 'extensions', jsonb_build_object('name', e.extname, 'version', e.extversion, 'schema', n.nspname)
  FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
  UNION ALL
  SELECT 'event_triggers', jsonb_build_object('name', e.evtname, 'event', e.evtevent,
    'enabled', e.evtenabled, 'function', e.evtfoid::regprocedure::text, 'tags', e.evttags)
  FROM pg_event_trigger e
  UNION ALL
  SELECT 'nonpublic_function_bodies', jsonb_build_object(
    'identity', p.oid::regprocedure::text, 'language', l.lanname,
    'definition', pg_get_functiondef(p.oid)
  ) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_language l ON l.oid=p.prolang
  WHERE n.nspname <> 'public' AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    AND l.lanname IN ('sql','plpgsql') AND p.prokind IN ('f','p','w')
  UNION ALL
  SELECT 'foreign_servers', jsonb_build_object('name', s.srvname, 'type', s.srvtype,
    'wrapper', w.fdwname) FROM pg_foreign_server s JOIN pg_foreign_data_wrapper w ON w.oid=s.srvfdw
  UNION ALL
  SELECT 'publications', jsonb_build_object('name', p.pubname, 'all_tables', p.puballtables,
    'insert', p.pubinsert, 'update', p.pubupdate, 'delete', p.pubdelete, 'truncate', p.pubtruncate)
  FROM pg_publication p
  UNION ALL
  SELECT 'publication_tables', jsonb_build_object('publication', pubname,'schema',schemaname,'table',tablename)
  FROM pg_publication_tables
), sections AS (
  SELECT section, jsonb_agg(item ORDER BY item::text) AS items FROM entries GROUP BY section
)
SELECT jsonb_object_agg(section,items ORDER BY section) FROM sections;
-- Keep empty classes explicit; pg_cron exists in the pinned replay image.
SELECT jsonb_build_object('cron_jobs', coalesce((SELECT jsonb_agg(jsonb_build_object(
  'name',jobname,'schedule',schedule,'command',command,'host',nodename,'port',nodeport,
  'database',database,'user',username,'active',active) ORDER BY jobid) FROM cron.job),'[]'::jsonb),
  'foreign_server_count',(SELECT count(*) FROM pg_foreign_server),
  'public_view_count',(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('v','m')),
  'public_enum_count',(SELECT count(*) FROM pg_type WHERE typnamespace='public'::regnamespace AND typtype='e'),
  'server_version',current_setting('server_version'),
  'migration_versions',(SELECT jsonb_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations));
ROLLBACK;
