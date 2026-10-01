-- Real metadata transactions only; this proves neither HTTP status, Storage
-- compensation/bytes, native UI nor RLS. Run only through the disposable DB runner.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT no_plan();

SELECT dblink_connect('document_cap_holder', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_document_cap_holder');
SELECT dblink_connect('document_cap_a', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_document_cap_a');
SELECT dblink_connect('document_cap_b', 'hostaddr=' || host(inet_server_addr()) ||
  ' port=' || current_setting('port') || ' user=postgres password=postgres dbname=' || current_database() ||
  ' application_name=t3_document_cap_b');
SELECT dblink_exec('document_cap_a', $$SET statement_timeout='10s'; SET default_transaction_isolation='read committed'$$);
SELECT dblink_exec('document_cap_b', $$SET statement_timeout='10s'; SET default_transaction_isolation='read committed'$$);

-- These committed rows belong only to this contract. Inserting the 50-byte
-- archived row before lowering the cap avoids mistaking setup for cap failure.
SELECT dblink_exec('document_cap_holder', $fixture$
  INSERT INTO auth.users(id,email) VALUES
    ('d136c000-0000-4000-8000-000000000001','document-cap-concurrency@example.test');
  INSERT INTO public.organizations(id,name,created_by) VALUES
    ('d136c000-0000-4000-8000-000000000101','Document Cap Concurrency A','d136c000-0000-4000-8000-000000000001'),
    ('d136c000-0000-4000-8000-000000000102','Document Cap Concurrency B','d136c000-0000-4000-8000-000000000001');
  INSERT INTO public.personnel(id,organization_id,rank,first_name,last_name,slug) VALUES
    ('d136c000-0000-4000-8000-000000000301','d136c000-0000-4000-8000-000000000101','SPC','Target','Cap','document-cap-target'),
    ('d136c000-0000-4000-8000-000000000302','d136c000-0000-4000-8000-000000000101','SPC','Other','Sentinel','document-cap-other'),
    ('d136c000-0000-4000-8000-000000000303','d136c000-0000-4000-8000-000000000102','SPC','Foreign','Sentinel','document-cap-foreign');
  INSERT INTO public.personnel_documents(id,organization_id,personnel_id,title,file_path,file_size_bytes,content_type,uploaded_by,archived_at) VALUES
    ('d136c000-0000-4000-8000-000000000401','d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000301','Active eight','d136c000-0000-4000-8000-000000000101/personnel/d136c000-0000-4000-8000-000000000301/documents/active.pdf',8,'application/pdf','synthetic-sql',NULL),
    ('d136c000-0000-4000-8000-000000000402','d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000301','Archived fifty','d136c000-0000-4000-8000-000000000101/personnel/d136c000-0000-4000-8000-000000000301/documents/archived.pdf',50,'application/pdf','synthetic-sql','2026-01-01Z'),
    ('d136c000-0000-4000-8000-000000000403','d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000302','Other Person sentinel','d136c000-0000-4000-8000-000000000101/personnel/d136c000-0000-4000-8000-000000000302/documents/other.pdf',13,'application/pdf','synthetic-sql',NULL),
    ('d136c000-0000-4000-8000-000000000404','d136c000-0000-4000-8000-000000000102','d136c000-0000-4000-8000-000000000303','Foreign sentinel','d136c000-0000-4000-8000-000000000102/personnel/d136c000-0000-4000-8000-000000000303/documents/foreign.pdf',17,'application/pdf','synthetic-sql',NULL);
$fixture$);
SELECT diag('DOCUMENT_CAP_DEFAULTS=' || jsonb_agg(jsonb_build_object(
  'id',id,'cap_bytes',personnel_document_storage_cap_bytes) ORDER BY id)::text)
  FROM public.organizations WHERE id IN ('d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000102');
SELECT dblink_exec('document_cap_holder',$setting$
  UPDATE public.organizations SET personnel_document_storage_cap_bytes=12
    WHERE id='d136c000-0000-4000-8000-000000000101';
$setting$);

CREATE TEMP TABLE document_cap_documents_before AS
  SELECT id,to_jsonb(d) row_data FROM public.personnel_documents d
  WHERE organization_id IN ('d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000102');
CREATE TEMP TABLE document_cap_personnel_before AS
  SELECT id,to_jsonb(p) row_data FROM public.personnel p
  WHERE organization_id IN ('d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000102');
CREATE TEMP TABLE document_cap_organizations_before AS
  SELECT id,to_jsonb(o) row_data FROM public.organizations o
  WHERE id IN ('d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000102');
CREATE TEMP TABLE document_cap_sessions(name text PRIMARY KEY,pid integer,isolation text);
INSERT INTO document_cap_sessions
  SELECT 'holder',* FROM dblink('document_cap_holder', $$SELECT pg_backend_pid(),current_setting('transaction_isolation')$$) AS session(pid integer,isolation text);
INSERT INTO document_cap_sessions
  SELECT 'a',* FROM dblink('document_cap_a', $$SELECT pg_backend_pid(),current_setting('transaction_isolation')$$) AS session(pid integer,isolation text);
INSERT INTO document_cap_sessions
  SELECT 'b',* FROM dblink('document_cap_b', $$SELECT pg_backend_pid(),current_setting('transaction_isolation')$$) AS session(pid integer,isolation text);
SELECT is((SELECT count(DISTINCT pid)::integer FROM document_cap_sessions),3,'holder and both inserts use distinct real sessions');
SELECT ok((SELECT bool_and(isolation='read committed') FROM document_cap_sessions WHERE name IN ('a','b')),'both insert transactions use READ COMMITTED');
SELECT diag('DOCUMENT_CAP_EFFECTIVE=' || jsonb_build_object(
  'server_version',current_setting('server_version'),
  'function',pg_get_functiondef('public.enforce_personnel_document_storage_cap()'::regprocedure),
  'trigger',(SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.personnel_documents'::regclass AND tgname='enforce_personnel_document_storage_cap'),
  'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY name) FROM document_cap_sessions s)
)::text);
SELECT diag('DOCUMENT_CAP_BEFORE=' || jsonb_build_object(
  'documents',(SELECT jsonb_agg(row_data ORDER BY id) FROM document_cap_documents_before),
  'personnel',(SELECT jsonb_agg(row_data ORDER BY id) FROM document_cap_personnel_before),
  'organizations',(SELECT jsonb_agg(row_data ORDER BY id) FROM document_cap_organizations_before)
)::text);

CREATE TEMP TABLE document_cap_wait_receipt(observed_at timestamptz,elapsed_ms numeric,waiting jsonb,chains jsonb);
CREATE FUNCTION pg_temp.document_cap_both_wait() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  started timestamptz := clock_timestamp();
  deadline timestamptz := started + interval '5 seconds';
  waiting jsonb;
  chains jsonb;
  both_wait boolean;
  both_blocked_by_holder boolean;
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    SELECT count(*)=2 AND bool_and(a.state='active' AND a.wait_event_type='Lock'),
      jsonb_agg(jsonb_build_object('name',s.name,'pid',a.pid,'state',a.state,
        'backend_xid',a.backend_xid::text,'wait_event_type',a.wait_event_type,'wait_event',a.wait_event,
        'blockers',pg_blocking_pids(a.pid),'query',a.query) ORDER BY s.name)
      INTO both_wait,waiting
      FROM pg_stat_activity a JOIN document_cap_sessions s ON s.pid=a.pid WHERE s.name IN ('a','b');
    WITH RECURSIVE blocking_chain(origin,pid,route) AS (
      SELECT pid,pid,ARRAY[pid] FROM document_cap_sessions WHERE name IN ('a','b')
      UNION ALL
      SELECT c.origin,b.pid,c.route || b.pid FROM blocking_chain c
        CROSS JOIN LATERAL unnest(pg_blocking_pids(c.pid)) AS b(pid)
        WHERE NOT b.pid=ANY(c.route)
    )
    SELECT count(DISTINCT origin) FILTER (WHERE pid=(SELECT pid FROM document_cap_sessions WHERE name='holder'))=2,
      jsonb_agg(jsonb_build_object('origin',origin,'pid',pid,'route',route) ORDER BY origin,pid)
      INTO both_blocked_by_holder,chains FROM blocking_chain;
    IF (both_wait AND both_blocked_by_holder) OR clock_timestamp() >= deadline THEN
      INSERT INTO document_cap_wait_receipt VALUES(clock_timestamp(),extract(epoch FROM clock_timestamp()-started)*1000,waiting,chains);
      RETURN coalesce(both_wait AND both_blocked_by_holder,false);
    END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END $$;

SELECT dblink_exec('document_cap_holder','BEGIN');
SELECT * FROM dblink('document_cap_holder',$lock$
  SELECT id FROM public.personnel
    WHERE id='d136c000-0000-4000-8000-000000000301'
      AND organization_id='d136c000-0000-4000-8000-000000000101' FOR UPDATE
$lock$) AS locked(id uuid);
-- Each asynchronous INSERT is its own real implicit transaction. Autocommit
-- lets whichever wins release its parent lock without prescribing a winner.
SELECT dblink_send_query('document_cap_a',$insert$
  INSERT INTO public.personnel_documents(id,organization_id,personnel_id,title,file_path,file_size_bytes,content_type,uploaded_by)
  VALUES ('d136c000-0000-4000-8000-000000000405','d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000301','Concurrent A','d136c000-0000-4000-8000-000000000101/personnel/d136c000-0000-4000-8000-000000000301/documents/concurrent-a.pdf',4,'application/pdf','synthetic-sql')
  RETURNING id
$insert$);
SELECT dblink_send_query('document_cap_b',$insert$
  INSERT INTO public.personnel_documents(id,organization_id,personnel_id,title,file_path,file_size_bytes,content_type,uploaded_by)
  VALUES ('d136c000-0000-4000-8000-000000000406','d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000301','Concurrent B','d136c000-0000-4000-8000-000000000101/personnel/d136c000-0000-4000-8000-000000000301/documents/concurrent-b.pdf',4,'application/pdf','synthetic-sql')
  RETURNING id
$insert$);
SELECT ok(pg_temp.document_cap_both_wait(),'both inserts actually wait in the blocking chain of the held parent');
SELECT diag('DOCUMENT_CAP_WAIT=' || to_jsonb(r)::text) FROM document_cap_wait_receipt r;
SELECT dblink_exec('document_cap_holder','COMMIT');

CREATE TEMP TABLE document_cap_admitted(session text,id uuid);
CREATE TEMP TABLE document_cap_outcomes(session text,error text);
INSERT INTO document_cap_admitted SELECT 'a',id FROM dblink_get_result('document_cap_a',false) AS result(id uuid);
INSERT INTO document_cap_outcomes VALUES('a',dblink_error_message('document_cap_a'));
SELECT * FROM dblink_get_result('document_cap_a',false) AS result(id uuid);
INSERT INTO document_cap_admitted SELECT 'b',id FROM dblink_get_result('document_cap_b',false) AS result(id uuid);
INSERT INTO document_cap_outcomes VALUES('b',dblink_error_message('document_cap_b'));
SELECT * FROM dblink_get_result('document_cap_b',false) AS result(id uuid);
SELECT is((SELECT count(*)::integer FROM document_cap_admitted),1,'exactly one concurrent insert is admitted');
SELECT is((SELECT count(*)::integer FROM document_cap_outcomes WHERE error='OK'),1,'exactly one insert completes without an error');
SELECT is((SELECT count(*)::integer FROM document_cap_outcomes WHERE error LIKE '%personnel document storage cap exceeded%'),1,'the other insert rejects for the storage cap');
SELECT is((SELECT sum(file_size_bytes) FROM public.personnel_documents
  WHERE organization_id='d136c000-0000-4000-8000-000000000101'
    AND personnel_id='d136c000-0000-4000-8000-000000000301' AND archived_at IS NULL),12::numeric,
  'active bytes equal the cap; the archived fifty bytes do not consume it');
SELECT results_eq($query$
  SELECT id FROM public.personnel_documents WHERE personnel_id='d136c000-0000-4000-8000-000000000301' ORDER BY id
$query$,$expected$
  SELECT id FROM document_cap_documents_before WHERE row_data->>'personnel_id'='d136c000-0000-4000-8000-000000000301'
  UNION SELECT id FROM document_cap_admitted ORDER BY id
$expected$,'the target has exactly its original rows plus the admitted insert, with no losing row');
SELECT results_eq($query$
  SELECT id,to_jsonb(d) FROM public.personnel_documents d
    WHERE id IN (SELECT id FROM document_cap_documents_before) ORDER BY id
$query$,$expected$ SELECT id,row_data FROM document_cap_documents_before ORDER BY id $expected$,
  'original active, archived, other-Person and foreign document fields remain exact');
SELECT results_eq($query$
  SELECT id,to_jsonb(p) FROM public.personnel p WHERE id IN (SELECT id FROM document_cap_personnel_before) ORDER BY id
$query$,$expected$ SELECT id,row_data FROM document_cap_personnel_before ORDER BY id $expected$,
  'all Personnel sentinel fields remain exact');
SELECT results_eq($query$
  SELECT id,to_jsonb(o) FROM public.organizations o WHERE id IN (SELECT id FROM document_cap_organizations_before) ORDER BY id
$query$,$expected$ SELECT id,row_data FROM document_cap_organizations_before ORDER BY id $expected$,
  'both Organization settings and fields remain exact');
SELECT diag('DOCUMENT_CAP_AFTER=' || jsonb_build_object(
  'admitted',(SELECT jsonb_agg(to_jsonb(a) ORDER BY session) FROM document_cap_admitted a),
  'outcomes',(SELECT jsonb_agg(to_jsonb(o) ORDER BY session) FROM document_cap_outcomes o),
  'documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.personnel_documents d
    WHERE organization_id IN ('d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000102'))
)::text);

SELECT dblink_exec('document_cap_holder',$cleanup$
  DELETE FROM public.organizations WHERE id IN ('d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000102');
  DELETE FROM auth.users WHERE id='d136c000-0000-4000-8000-000000000001';
$cleanup$);
SELECT is((
  (SELECT count(*) FROM public.organizations WHERE id IN ('d136c000-0000-4000-8000-000000000101','d136c000-0000-4000-8000-000000000102')) +
  (SELECT count(*) FROM public.personnel WHERE id IN ('d136c000-0000-4000-8000-000000000301','d136c000-0000-4000-8000-000000000302','d136c000-0000-4000-8000-000000000303')) +
  (SELECT count(*) FROM public.personnel_documents WHERE id IN ('d136c000-0000-4000-8000-000000000401','d136c000-0000-4000-8000-000000000402','d136c000-0000-4000-8000-000000000403','d136c000-0000-4000-8000-000000000404','d136c000-0000-4000-8000-000000000405','d136c000-0000-4000-8000-000000000406')) +
  (SELECT count(*) FROM auth.users WHERE id='d136c000-0000-4000-8000-000000000001')
)::integer,0,'every committed fixture row is removed by exact owned identity');
SELECT dblink_disconnect('document_cap_a');
SELECT dblink_disconnect('document_cap_b');
SELECT dblink_disconnect('document_cap_holder');
SELECT * FROM finish();
ROLLBACK;
