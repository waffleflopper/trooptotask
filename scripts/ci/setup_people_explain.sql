BEGIN;
INSERT INTO auth.users(id,email,created_at)
SELECT md5('s4-explain-account-' || n)::uuid, 's4-explain-' || n || '@example.test', '2026-01-01'::timestamptz + n * interval '1 minute'
FROM generate_series(1,1000) n;
INSERT INTO public.user_profiles(user_id,first_name,last_name)
SELECT md5('s4-explain-account-' || n)::uuid, 'Explain Dana', n::text FROM generate_series(1,1000) n;
INSERT INTO public.user_suspensions(user_id,suspended_by,reason)
SELECT md5('s4-explain-account-' || n)::uuid, md5('s4-explain-account-1')::uuid, 'Synthetic suspension'
FROM generate_series(1,100) n;
INSERT INTO public.access_requests(id,email,name,status,approval_basis,reviewed_at,created_at)
SELECT md5('s4-explain-request-' || n)::uuid, 's4-explain-request-' || n || '@example.test', 'Explain Pending ' || n,
 'approved','platform_review','2026-01-01','2026-01-01'::timestamptz + n * interval '1 minute'
FROM generate_series(1,1000) n;
INSERT INTO public.account_setup_links(id,access_request_id,token_hash,created_at,expires_at)
SELECT md5('s4-explain-link-' || n)::uuid, md5('s4-explain-request-' || n)::uuid, md5('s4-explain-token-' || n),
 '2026-01-02','2026-01-16' FROM generate_series(1,1000) n;
ANALYZE auth.users;
ANALYZE public.user_profiles;
ANALYZE public.user_suspensions;
ANALYZE public.access_requests;
ANALYZE public.account_setup_links;
DO $$
DECLARE body text; query text; plan json; scenario record; result jsonb;
BEGIN
 SELECT prosrc INTO body FROM pg_proc WHERE oid = 'public.platform_account_directory(text,text,integer,integer)'::regprocedure;
 FOR scenario IN SELECT * FROM (VALUES ('all','','all',1), ('name','Explain Dana 17','all',1),
   ('email','s4-explain-170@','all',1), ('notSetUp','','notSetUp',1), ('suspended','','suspended',1), ('laterPage','','all',50))
   AS cases(label,search,filter,page)
 LOOP
   query := replace(replace(replace(replace(body,'p_search',quote_literal(scenario.search)),
     'p_filter',quote_literal(scenario.filter)),'p_page',scenario.page::text),'p_limit','20');
   EXECUTE query INTO result;
   IF jsonb_array_length(result->'people') > 20 OR (result->>'totalCount')::integer = 0 THEN
     RAISE EXCEPTION 'Unexpected synthetic directory result for %', scenario.label;
   END IF;
   EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || query INTO plan;
   RAISE NOTICE 'S4_EXPLAIN % rows=% plan=%', scenario.label, result->>'totalCount', plan;
 END LOOP;
END;
$$;
ROLLBACK;
