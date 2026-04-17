DO $$
BEGIN
  CREATE TYPE "public"."ict_validation_method" AS ENUM (
    'Lecture',
    'Demonstration',
    'Practical Exercise',
    'Simulation',
    'Case Study',
    'Discussion',
    'Problem-Based Learning',
    'Role-Playing',
    'Other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_ict_completion_record"(
  "p_organization_id" "uuid",
  "p_personnel_id" "uuid"
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    JOIN "public"."personnel"
      ON "personnel"."id" = "p_personnel_id"
     AND "personnel"."organization_id" = "p_organization_id"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_edit_training" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;

ALTER FUNCTION "public"."can_edit_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_view_personnel_ict_completion_record"(
  "p_organization_id" "uuid",
  "p_personnel_id" "uuid"
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    JOIN "public"."personnel"
      ON "personnel"."id" = "p_personnel_id"
     AND "personnel"."organization_id" = "p_organization_id"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_view_training" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;

ALTER FUNCTION "public"."can_view_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."ict_tasks" (
  "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
  "organization_id" "uuid" NOT NULL,
  "task_code" "text" NOT NULL,
  "title" "text" NOT NULL,
  "mos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
  "expiration_months" integer,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "ict_tasks_task_code_not_blank" CHECK (length(btrim("task_code")) > 0),
  CONSTRAINT "ict_tasks_title_not_blank" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "ict_tasks_expiration_months_positive" CHECK (("expiration_months" IS NULL) OR ("expiration_months" > 0))
);

ALTER TABLE "public"."ict_tasks" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."personnel_ict_completions" (
  "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
  "organization_id" "uuid" NOT NULL,
  "personnel_id" "uuid" NOT NULL,
  "ict_task_id" "uuid" NOT NULL,
  "completed_at" "date" NOT NULL,
  "validation_method" "public"."ict_validation_method" NOT NULL,
  "validated_by" "text",
  "notes" "text",
  "logged_by" "uuid" DEFAULT "auth"."uid"(),
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."personnel_ict_completions" OWNER TO "postgres";

ALTER TABLE ONLY "public"."ict_tasks"
  ADD CONSTRAINT "ict_tasks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."ict_tasks"
  ADD CONSTRAINT "ict_tasks_organization_id_task_code_key" UNIQUE ("organization_id", "task_code");

ALTER TABLE ONLY "public"."personnel_ict_completions"
  ADD CONSTRAINT "personnel_ict_completions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."personnel_ict_completions"
  ADD CONSTRAINT "personnel_ict_completions_org_person_task_date_key" UNIQUE ("organization_id", "personnel_id", "ict_task_id", "completed_at");

CREATE INDEX "idx_ict_tasks_org" ON "public"."ict_tasks" USING "btree" ("organization_id");
CREATE INDEX "idx_ict_tasks_archived_at" ON "public"."ict_tasks" USING "btree" ("archived_at");
CREATE INDEX "idx_ict_tasks_mos" ON "public"."ict_tasks" USING "gin" ("mos");
CREATE INDEX "idx_personnel_ict_completions_org" ON "public"."personnel_ict_completions" USING "btree" ("organization_id");
CREATE INDEX "idx_personnel_ict_completions_personnel" ON "public"."personnel_ict_completions" USING "btree" ("personnel_id");
CREATE INDEX "idx_personnel_ict_completions_task" ON "public"."personnel_ict_completions" USING "btree" ("ict_task_id");
CREATE INDEX "idx_personnel_ict_completions_completed_at" ON "public"."personnel_ict_completions" USING "btree" ("completed_at");

CREATE OR REPLACE TRIGGER "update_ict_tasks_updated_at"
  BEFORE UPDATE ON "public"."ict_tasks"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_personnel_ict_completions_updated_at"
  BEFORE UPDATE ON "public"."personnel_ict_completions"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE ONLY "public"."ict_tasks"
  ADD CONSTRAINT "ict_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."personnel_ict_completions"
  ADD CONSTRAINT "personnel_ict_completions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."personnel_ict_completions"
  ADD CONSTRAINT "personnel_ict_completions_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."personnel_ict_completions"
  ADD CONSTRAINT "personnel_ict_completions_ict_task_id_fkey" FOREIGN KEY ("ict_task_id") REFERENCES "public"."ict_tasks"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."personnel_ict_completions"
  ADD CONSTRAINT "personnel_ict_completions_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

CREATE POLICY "Users can view ICT tasks if they can view training data" ON "public"."ict_tasks" FOR SELECT USING ("public"."can_view_training"("organization_id"));

CREATE POLICY "Users can manage ICT tasks if they can manage training config" ON "public"."ict_tasks" USING ("public"."can_manage_training_configuration"("organization_id")) WITH CHECK ("public"."can_manage_training_configuration"("organization_id"));

CREATE POLICY "Users can view personnel ICT completions if allowed by scoped training access" ON "public"."personnel_ict_completions" FOR SELECT USING ("public"."can_view_personnel_ict_completion_record"("organization_id", "personnel_id"));

CREATE POLICY "Users can insert personnel ICT completions if allowed by scoped training access" ON "public"."personnel_ict_completions" FOR INSERT WITH CHECK ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id"));

CREATE POLICY "Users can update personnel ICT completions if allowed by scoped training access" ON "public"."personnel_ict_completions" FOR UPDATE USING ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id")) WITH CHECK ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id"));

CREATE POLICY "Users can delete personnel ICT completions if allowed by scoped training access" ON "public"."personnel_ict_completions" FOR DELETE USING ("public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id"));

ALTER TABLE "public"."ict_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."personnel_ict_completions" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON FUNCTION "public"."can_edit_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."can_view_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_personnel_ict_completion_record"("p_organization_id" "uuid", "p_personnel_id" "uuid") TO "service_role";

GRANT ALL ON TABLE "public"."ict_tasks" TO "anon";
GRANT ALL ON TABLE "public"."ict_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."ict_tasks" TO "service_role";

GRANT ALL ON TABLE "public"."personnel_ict_completions" TO "anon";
GRANT ALL ON TABLE "public"."personnel_ict_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."personnel_ict_completions" TO "service_role";
