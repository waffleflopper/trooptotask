DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "pg_constraint"
        WHERE "conname" = 'personnel_extended_info_number_of_dependents_nonnegative'
          AND "conrelid" = 'public.personnel_extended_info'::regclass
    ) THEN
        ALTER TABLE "public"."personnel_extended_info"
            ADD CONSTRAINT "personnel_extended_info_number_of_dependents_nonnegative"
            CHECK ("number_of_dependents" IS NULL OR "number_of_dependents" >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "pg_constraint"
        WHERE "conname" = 'leader_notes_text_not_blank'
          AND "conrelid" = 'public.leader_notes'::regclass
    ) THEN
        ALTER TABLE "public"."leader_notes"
            ADD CONSTRAINT "leader_notes_text_not_blank"
            CHECK (length(btrim("text")) > 0);
    END IF;
END $$;
