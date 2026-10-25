BEGIN;

CREATE SEQUENCE public.whats_new_publish_seq AS bigint;

-- Ordering is publication order. Imported entries take the sequence oldest first.
CREATE TABLE public.whats_new_entries (
	id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	title text NOT NULL,
	paragraphs text[] NOT NULL DEFAULT ARRAY[]::text[],
	published_on date,
	published_seq bigint UNIQUE,
	updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT whats_new_entries_id_shape CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,99}$'),
	CONSTRAINT whats_new_entries_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
	CONSTRAINT whats_new_entries_paragraph_count CHECK (cardinality(paragraphs) <= 30),
	CONSTRAINT whats_new_entries_paragraphs_present CHECK (published_on IS NULL OR cardinality(paragraphs) >= 1),
	CONSTRAINT whats_new_entries_paragraphs_not_blank CHECK ('' <> ALL (paragraphs) AND array_position(paragraphs, NULL) IS NULL),
	CONSTRAINT whats_new_entries_published_pair CHECK ((published_on IS NULL) = (published_seq IS NULL))
);

CREATE FUNCTION public.whats_new_entries_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
	IF NEW.published_on IS NULL THEN
		NEW.published_seq := NULL;
	ELSIF TG_OP = 'UPDATE' AND OLD.published_seq IS NOT NULL THEN
		NEW.published_seq := OLD.published_seq;
	ELSE
		NEW.published_seq := pg_catalog.nextval('public.whats_new_publish_seq');
	END IF;
	IF TG_OP = 'UPDATE' THEN NEW.updated_at := pg_catalog.now(); END IF;
	RETURN NEW;
END $$;

CREATE TRIGGER whats_new_entries_stamp BEFORE INSERT OR UPDATE ON public.whats_new_entries
	FOR EACH ROW EXECUTE FUNCTION public.whats_new_entries_stamp();

CREATE INDEX whats_new_entries_published_seq_idx ON public.whats_new_entries (published_seq DESC)
	WHERE published_seq IS NOT NULL;

ALTER TABLE public.whats_new_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whats_new_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.whats_new_publish_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.whats_new_entries TO authenticated;
GRANT ALL ON public.whats_new_entries TO service_role;
GRANT USAGE ON SEQUENCE public.whats_new_publish_seq TO service_role;

-- Entries are written only by the server on behalf of the operator, so attribution and audit stay server-bound.
CREATE POLICY "Signed-in accounts read published entries" ON public.whats_new_entries
	FOR SELECT TO authenticated USING (published_on IS NOT NULL);

COMMIT;
