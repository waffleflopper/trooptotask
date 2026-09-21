-- Full synthetic row capture, only from the owned disposable fixture project.
-- Preserve all fields, including shared JSON and commercial-looking history.
BEGIN ISOLATION LEVEL REPEATABLE READ;
CREATE TEMP TABLE captured_rows (relation text PRIMARY KEY, rows jsonb NOT NULL);
DO $$
DECLARE relation record;
BEGIN
  FOR relation IN
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname='public' OR (schemaname='auth' AND tablename='users')
    ORDER BY schemaname, tablename
  LOOP
    EXECUTE format(
      'INSERT INTO captured_rows SELECT %L, coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), ''[]''::jsonb) FROM %I.%I t',
      relation.schemaname || '.' || relation.tablename, relation.schemaname, relation.tablename);
  END LOOP;
END $$;
SELECT jsonb_object_agg(relation, rows ORDER BY relation) FROM captured_rows;
ROLLBACK;
