CREATE TABLE IF NOT EXISTS "public"."organization_rank_catalog" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "organization_id" "uuid" NOT NULL,
  "code" "text" NOT NULL,
  "label" "text" NOT NULL,
  "service" "text" NOT NULL,
  "category" "text" NOT NULL,
  "pay_grade" "text" NOT NULL,
  "state" "text" DEFAULT 'active'::"text" NOT NULL,
  "source" "text" DEFAULT 'custom'::"text" NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "organization_rank_catalog_code_check" CHECK (("code" = btrim("code") AND length("code") BETWEEN 1 AND 80)),
  CONSTRAINT "organization_rank_catalog_label_check" CHECK ((length(btrim("label")) BETWEEN 1 AND 120)),
  CONSTRAINT "organization_rank_catalog_service_check" CHECK (("service" = ANY (ARRAY['army'::"text", 'navy'::"text", 'air-force'::"text", 'marine-corps'::"text", 'coast-guard'::"text", 'space-force'::"text", 'civilian'::"text", 'custom'::"text"]))),
  CONSTRAINT "organization_rank_catalog_category_check" CHECK (("category" = ANY (ARRAY['officer'::"text", 'warrant'::"text", 'enlisted'::"text", 'civilian'::"text", 'custom'::"text"]))),
  CONSTRAINT "organization_rank_catalog_pay_grade_check" CHECK (("pay_grade" = 'ungraded'::"text" OR "pay_grade" ~ '^[OWE]-[0-9]+$'::"text")),
  CONSTRAINT "organization_rank_catalog_state_check" CHECK (("state" = ANY (ARRAY['active'::"text", 'retired'::"text"]))),
  CONSTRAINT "organization_rank_catalog_source_check" CHECK (("source" = ANY (ARRAY['built-in'::"text", 'discovered'::"text", 'custom'::"text"])))
);

ALTER TABLE "public"."organization_rank_catalog" OWNER TO "postgres";

ALTER TABLE ONLY "public"."organization_rank_catalog"
  ADD CONSTRAINT "organization_rank_catalog_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."organization_rank_catalog"
  ADD CONSTRAINT "organization_rank_catalog_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "organization_rank_catalog_org_code_key" ON "public"."organization_rank_catalog" USING "btree" ("organization_id", "code");

CREATE INDEX IF NOT EXISTS "organization_rank_catalog_org_state_sort_idx" ON "public"."organization_rank_catalog" USING "btree" ("organization_id", "state", "sort_order", "label");

CREATE OR REPLACE TRIGGER "organization_rank_catalog_updated_at"
  BEFORE UPDATE ON "public"."organization_rank_catalog"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE FUNCTION "public"."can_update_organization_settings"("p_organization_id" uuid)
RETURNS boolean
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND "organization_memberships"."role" IN ('owner', 'admin')
  );
$$;

ALTER FUNCTION "public"."can_update_organization_settings"(uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_export_organization_data"("p_organization_id" uuid)
RETURNS boolean
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."capability_overrides" ->> 'canManageMembers' = 'true'
      )
  );
$$;

ALTER FUNCTION "public"."can_export_organization_data"(uuid) OWNER TO "postgres";

ALTER TABLE "public"."organization_rank_catalog" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization rank catalog if they can view personnel" ON "public"."organization_rank_catalog";
DROP POLICY IF EXISTS "Users can view organization rank catalog for rank-aware workspaces" ON "public"."organization_rank_catalog";
DROP POLICY IF EXISTS "Organization governors can manage organization rank catalog" ON "public"."organization_rank_catalog";

CREATE POLICY "Users can view organization rank catalog for rank-aware workspaces"
  ON "public"."organization_rank_catalog"
  FOR SELECT
  USING (
    "public"."can_view_personnel"("organization_id")
    OR "public"."can_view_calendar"("organization_id")
    OR "public"."can_view_training"("organization_id")
    OR "public"."can_view_critical_tasks"("organization_id")
    OR "public"."can_export_organization_data"("organization_id")
    OR "public"."can_update_organization_settings"("organization_id")
  );

CREATE POLICY "Organization governors can manage organization rank catalog"
  ON "public"."organization_rank_catalog"
  FOR ALL
  USING ("public"."can_update_organization_settings"("organization_id"))
  WITH CHECK ("public"."can_update_organization_settings"("organization_id"));

REVOKE ALL ON TABLE "public"."organization_rank_catalog" FROM "anon";
GRANT ALL ON TABLE "public"."organization_rank_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_rank_catalog" TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_update_organization_settings"("p_organization_id" uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_update_organization_settings"("p_organization_id" uuid) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."can_update_organization_settings"("p_organization_id" uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_update_organization_settings"("p_organization_id" uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_export_organization_data"("p_organization_id" uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_export_organization_data"("p_organization_id" uuid) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."can_export_organization_data"("p_organization_id" uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_export_organization_data"("p_organization_id" uuid) TO "service_role";

WITH default_rank_catalog (
  code,
  label,
  service,
  category,
  pay_grade,
  state,
  sort_order
) AS (
  VALUES
    ('GEN', 'General', 'army', 'officer', 'O-10', 'active', 0),
    ('LTG', 'Lieutenant General', 'army', 'officer', 'O-9', 'active', 0),
    ('MG', 'Major General', 'army', 'officer', 'O-8', 'active', 0),
    ('BG', 'Brigadier General', 'army', 'officer', 'O-7', 'active', 0),
    ('COL', 'Colonel', 'army', 'officer', 'O-6', 'active', 0),
    ('LTC', 'Lieutenant Colonel', 'army', 'officer', 'O-5', 'active', 0),
    ('MAJ', 'Major', 'army', 'officer', 'O-4', 'active', 0),
    ('CPT', 'Captain', 'army', 'officer', 'O-3', 'active', 0),
    ('1LT', 'First Lieutenant', 'army', 'officer', 'O-2', 'active', 0),
    ('2LT', 'Second Lieutenant', 'army', 'officer', 'O-1', 'active', 0),
    ('CW5', 'Chief Warrant Officer 5', 'army', 'warrant', 'W-5', 'active', 0),
    ('CW4', 'Chief Warrant Officer 4', 'army', 'warrant', 'W-4', 'active', 0),
    ('CW3', 'Chief Warrant Officer 3', 'army', 'warrant', 'W-3', 'active', 0),
    ('CW2', 'Chief Warrant Officer 2', 'army', 'warrant', 'W-2', 'active', 0),
    ('WO1', 'Warrant Officer 1', 'army', 'warrant', 'W-1', 'active', 0),
    ('CSM', 'Command Sergeant Major', 'army', 'enlisted', 'E-9', 'active', 0),
    ('SGM', 'Sergeant Major', 'army', 'enlisted', 'E-9', 'active', 1),
    ('1SG', 'First Sergeant', 'army', 'enlisted', 'E-8', 'active', 0),
    ('MSG', 'Master Sergeant', 'army', 'enlisted', 'E-8', 'active', 1),
    ('SFC', 'Sergeant First Class', 'army', 'enlisted', 'E-7', 'active', 0),
    ('SSG', 'Staff Sergeant', 'army', 'enlisted', 'E-6', 'active', 0),
    ('SGT', 'Sergeant', 'army', 'enlisted', 'E-5', 'active', 0),
    ('CPL', 'Corporal', 'army', 'enlisted', 'E-4', 'active', 0),
    ('SPC', 'Specialist', 'army', 'enlisted', 'E-4', 'active', 1),
    ('SP4', 'Specialist Four', 'army', 'enlisted', 'E-4', 'retired', 2),
    ('PFC', 'Private First Class', 'army', 'enlisted', 'E-3', 'active', 0),
    ('PV2', 'Private Second Class', 'army', 'enlisted', 'E-2', 'active', 0),
    ('PV1', 'Private', 'army', 'enlisted', 'E-1', 'active', 0),
    ('ADM', 'Admiral', 'navy', 'officer', 'O-10', 'active', 0),
    ('VADM', 'Vice Admiral', 'navy', 'officer', 'O-9', 'active', 0),
    ('RADM', 'Rear Admiral', 'navy', 'officer', 'O-8', 'active', 0),
    ('RDML', 'Rear Admiral Lower Half', 'navy', 'officer', 'O-7', 'active', 0),
    ('CAPT', 'Captain', 'navy', 'officer', 'O-6', 'active', 0),
    ('CDR', 'Commander', 'navy', 'officer', 'O-5', 'active', 0),
    ('LCDR', 'Lieutenant Commander', 'navy', 'officer', 'O-4', 'active', 0),
    ('LT', 'Lieutenant', 'navy', 'officer', 'O-3', 'active', 0),
    ('LTJG', 'Lieutenant Junior Grade', 'navy', 'officer', 'O-2', 'active', 0),
    ('ENS', 'Ensign', 'navy', 'officer', 'O-1', 'active', 0),
    ('CWO5', 'Chief Warrant Officer 5', 'navy', 'warrant', 'W-5', 'active', 0),
    ('CWO4', 'Chief Warrant Officer 4', 'navy', 'warrant', 'W-4', 'active', 0),
    ('CWO3', 'Chief Warrant Officer 3', 'navy', 'warrant', 'W-3', 'active', 0),
    ('CWO2', 'Chief Warrant Officer 2', 'navy', 'warrant', 'W-2', 'active', 0),
    ('MCPO', 'Master Chief Petty Officer', 'navy', 'enlisted', 'E-9', 'active', 0),
    ('SCPO', 'Senior Chief Petty Officer', 'navy', 'enlisted', 'E-8', 'active', 0),
    ('CPO', 'Chief Petty Officer', 'navy', 'enlisted', 'E-7', 'active', 0),
    ('PO1', 'Petty Officer First Class', 'navy', 'enlisted', 'E-6', 'active', 0),
    ('PO2', 'Petty Officer Second Class', 'navy', 'enlisted', 'E-5', 'active', 0),
    ('PO3', 'Petty Officer Third Class', 'navy', 'enlisted', 'E-4', 'active', 0),
    ('SN', 'Seaman', 'navy', 'enlisted', 'E-3', 'active', 0),
    ('SA', 'Seaman Apprentice', 'navy', 'enlisted', 'E-2', 'active', 0),
    ('SR', 'Seaman Recruit', 'navy', 'enlisted', 'E-1', 'active', 0),
    ('Gen', 'General', 'air-force', 'officer', 'O-10', 'active', 0),
    ('Lt Gen', 'Lieutenant General', 'air-force', 'officer', 'O-9', 'active', 0),
    ('Maj Gen', 'Major General', 'air-force', 'officer', 'O-8', 'active', 0),
    ('Brig Gen', 'Brigadier General', 'air-force', 'officer', 'O-7', 'active', 0),
    ('Col', 'Colonel', 'air-force', 'officer', 'O-6', 'active', 0),
    ('Lt Col', 'Lieutenant Colonel', 'air-force', 'officer', 'O-5', 'active', 0),
    ('Maj', 'Major', 'air-force', 'officer', 'O-4', 'active', 0),
    ('Capt', 'Captain', 'air-force', 'officer', 'O-3', 'active', 0),
    ('1st Lt', 'First Lieutenant', 'air-force', 'officer', 'O-2', 'active', 0),
    ('2d Lt', 'Second Lieutenant', 'air-force', 'officer', 'O-1', 'active', 0),
    ('CMSgt', 'Chief Master Sergeant', 'air-force', 'enlisted', 'E-9', 'active', 0),
    ('SMSgt', 'Senior Master Sergeant', 'air-force', 'enlisted', 'E-8', 'active', 0),
    ('MSgt', 'Master Sergeant', 'air-force', 'enlisted', 'E-7', 'active', 0),
    ('TSgt', 'Technical Sergeant', 'air-force', 'enlisted', 'E-6', 'active', 0),
    ('SSgt', 'Staff Sergeant', 'air-force', 'enlisted', 'E-5', 'active', 0),
    ('SrA', 'Senior Airman', 'air-force', 'enlisted', 'E-4', 'active', 0),
    ('A1C', 'Airman First Class', 'air-force', 'enlisted', 'E-3', 'active', 0),
    ('Amn', 'Airman', 'air-force', 'enlisted', 'E-2', 'active', 0),
    ('AB', 'Airman Basic', 'air-force', 'enlisted', 'E-1', 'active', 0),
    ('USMC-Gen', 'General', 'marine-corps', 'officer', 'O-10', 'active', 0),
    ('USMC-LtGen', 'Lieutenant General', 'marine-corps', 'officer', 'O-9', 'active', 0),
    ('USMC-MajGen', 'Major General', 'marine-corps', 'officer', 'O-8', 'active', 0),
    ('USMC-BGen', 'Brigadier General', 'marine-corps', 'officer', 'O-7', 'active', 0),
    ('USMC-Col', 'Colonel', 'marine-corps', 'officer', 'O-6', 'active', 0),
    ('USMC-LtCol', 'Lieutenant Colonel', 'marine-corps', 'officer', 'O-5', 'active', 0),
    ('USMC-Maj', 'Major', 'marine-corps', 'officer', 'O-4', 'active', 0),
    ('USMC-Capt', 'Captain', 'marine-corps', 'officer', 'O-3', 'active', 0),
    ('USMC-1stLt', 'First Lieutenant', 'marine-corps', 'officer', 'O-2', 'active', 0),
    ('USMC-2ndLt', 'Second Lieutenant', 'marine-corps', 'officer', 'O-1', 'active', 0),
    ('USMC-CWO5', 'Chief Warrant Officer 5', 'marine-corps', 'warrant', 'W-5', 'active', 0),
    ('USMC-CWO4', 'Chief Warrant Officer 4', 'marine-corps', 'warrant', 'W-4', 'active', 0),
    ('USMC-CWO3', 'Chief Warrant Officer 3', 'marine-corps', 'warrant', 'W-3', 'active', 0),
    ('USMC-CWO2', 'Chief Warrant Officer 2', 'marine-corps', 'warrant', 'W-2', 'active', 0),
    ('USMC-WO1', 'Warrant Officer 1', 'marine-corps', 'warrant', 'W-1', 'active', 0),
    ('SgtMaj', 'Sergeant Major', 'marine-corps', 'enlisted', 'E-9', 'active', 0),
    ('MGySgt', 'Master Gunnery Sergeant', 'marine-corps', 'enlisted', 'E-9', 'active', 0),
    ('MSgt-USMC', 'Master Sergeant', 'marine-corps', 'enlisted', 'E-8', 'active', 0),
    ('1stSgt', 'First Sergeant', 'marine-corps', 'enlisted', 'E-8', 'active', 0),
    ('GySgt', 'Gunnery Sergeant', 'marine-corps', 'enlisted', 'E-7', 'active', 0),
    ('SSgt-USMC', 'Staff Sergeant', 'marine-corps', 'enlisted', 'E-6', 'active', 0),
    ('Sgt-USMC', 'Sergeant', 'marine-corps', 'enlisted', 'E-5', 'active', 0),
    ('Cpl-USMC', 'Corporal', 'marine-corps', 'enlisted', 'E-4', 'active', 0),
    ('LCpl', 'Lance Corporal', 'marine-corps', 'enlisted', 'E-3', 'active', 0),
    ('PFC-USMC', 'Private First Class', 'marine-corps', 'enlisted', 'E-2', 'active', 0),
    ('Pvt-USMC', 'Private', 'marine-corps', 'enlisted', 'E-1', 'active', 0),
    ('CG-ADM', 'Admiral', 'coast-guard', 'officer', 'O-10', 'active', 0),
    ('CG-VADM', 'Vice Admiral', 'coast-guard', 'officer', 'O-9', 'active', 0),
    ('CG-RADM', 'Rear Admiral', 'coast-guard', 'officer', 'O-8', 'active', 0),
    ('CG-RDML', 'Rear Admiral Lower Half', 'coast-guard', 'officer', 'O-7', 'active', 0),
    ('CG-CAPT', 'Captain', 'coast-guard', 'officer', 'O-6', 'active', 0),
    ('CG-CDR', 'Commander', 'coast-guard', 'officer', 'O-5', 'active', 0),
    ('CG-LCDR', 'Lieutenant Commander', 'coast-guard', 'officer', 'O-4', 'active', 0),
    ('CG-LT', 'Lieutenant', 'coast-guard', 'officer', 'O-3', 'active', 0),
    ('CG-LTJG', 'Lieutenant Junior Grade', 'coast-guard', 'officer', 'O-2', 'active', 0),
    ('CG-ENS', 'Ensign', 'coast-guard', 'officer', 'O-1', 'active', 0),
    ('CG-CWO4', 'Chief Warrant Officer 4', 'coast-guard', 'warrant', 'W-4', 'active', 0),
    ('CG-CWO3', 'Chief Warrant Officer 3', 'coast-guard', 'warrant', 'W-3', 'active', 0),
    ('CG-CWO2', 'Chief Warrant Officer 2', 'coast-guard', 'warrant', 'W-2', 'active', 0),
    ('CG-MCPO', 'Master Chief Petty Officer', 'coast-guard', 'enlisted', 'E-9', 'active', 0),
    ('CG-SCPO', 'Senior Chief Petty Officer', 'coast-guard', 'enlisted', 'E-8', 'active', 0),
    ('CG-CPO', 'Chief Petty Officer', 'coast-guard', 'enlisted', 'E-7', 'active', 0),
    ('CG-PO1', 'Petty Officer First Class', 'coast-guard', 'enlisted', 'E-6', 'active', 0),
    ('CG-PO2', 'Petty Officer Second Class', 'coast-guard', 'enlisted', 'E-5', 'active', 0),
    ('CG-PO3', 'Petty Officer Third Class', 'coast-guard', 'enlisted', 'E-4', 'active', 0),
    ('CG-SN', 'Seaman', 'coast-guard', 'enlisted', 'E-3', 'active', 0),
    ('CG-SA', 'Seaman Apprentice', 'coast-guard', 'enlisted', 'E-2', 'active', 0),
    ('CG-SR', 'Seaman Recruit', 'coast-guard', 'enlisted', 'E-1', 'active', 0),
    ('SF-Gen', 'General', 'space-force', 'officer', 'O-10', 'active', 0),
    ('SF-LtGen', 'Lieutenant General', 'space-force', 'officer', 'O-9', 'active', 0),
    ('SF-MajGen', 'Major General', 'space-force', 'officer', 'O-8', 'active', 0),
    ('SF-BrigGen', 'Brigadier General', 'space-force', 'officer', 'O-7', 'active', 0),
    ('SF-Col', 'Colonel', 'space-force', 'officer', 'O-6', 'active', 0),
    ('SF-LtCol', 'Lieutenant Colonel', 'space-force', 'officer', 'O-5', 'active', 0),
    ('SF-Maj', 'Major', 'space-force', 'officer', 'O-4', 'active', 0),
    ('SF-Capt', 'Captain', 'space-force', 'officer', 'O-3', 'active', 0),
    ('SF-1stLt', 'First Lieutenant', 'space-force', 'officer', 'O-2', 'active', 0),
    ('SF-2dLt', 'Second Lieutenant', 'space-force', 'officer', 'O-1', 'active', 0),
    ('CMSSF', 'Chief Master Sergeant of the Space Force', 'space-force', 'enlisted', 'E-9', 'active', 0),
    ('SF-CMSgt', 'Chief Master Sergeant', 'space-force', 'enlisted', 'E-9', 'active', 1),
    ('SF-SMSgt', 'Senior Master Sergeant', 'space-force', 'enlisted', 'E-8', 'active', 0),
    ('SF-MSgt', 'Master Sergeant', 'space-force', 'enlisted', 'E-7', 'active', 0),
    ('SF-TSgt', 'Technical Sergeant', 'space-force', 'enlisted', 'E-6', 'active', 0),
    ('SF-SSgt', 'Staff Sergeant', 'space-force', 'enlisted', 'E-5', 'active', 0),
    ('Spc4', 'Specialist 4', 'space-force', 'enlisted', 'E-4', 'active', 0),
    ('Spc3', 'Specialist 3', 'space-force', 'enlisted', 'E-3', 'active', 0),
    ('Spc2', 'Specialist 2', 'space-force', 'enlisted', 'E-2', 'active', 0),
    ('Spc1', 'Specialist 1', 'space-force', 'enlisted', 'E-1', 'active', 0),
    ('CIV', 'Civilian', 'civilian', 'civilian', 'ungraded', 'active', 0),
    ('CUSTOM', 'Custom / Ungraded', 'custom', 'custom', 'ungraded', 'active', 0)
)
INSERT INTO "public"."organization_rank_catalog" (
  "organization_id",
  "code",
  "label",
  "service",
  "category",
  "pay_grade",
  "state",
  "source",
  "sort_order"
)
SELECT
  "organizations"."id",
  "default_rank_catalog"."code",
  "default_rank_catalog"."label",
  "default_rank_catalog"."service",
  "default_rank_catalog"."category",
  "default_rank_catalog"."pay_grade",
  "default_rank_catalog"."state",
  'built-in',
  "default_rank_catalog"."sort_order"
FROM "public"."organizations"
CROSS JOIN default_rank_catalog
ON CONFLICT ("organization_id", "code") DO NOTHING;

WITH default_rank_codes AS (
  SELECT "code"
  FROM "public"."organization_rank_catalog"
  WHERE "source" = 'built-in'
),
discovered_rank_codes AS (
  SELECT
    "personnel"."organization_id",
    btrim("personnel"."rank") AS "code"
  FROM "public"."personnel"
  WHERE length(btrim(COALESCE("personnel"."rank", ''))) BETWEEN 1 AND 80
  GROUP BY "personnel"."organization_id", btrim("personnel"."rank")
),
unknown_rank_codes AS (
  SELECT
    "discovered_rank_codes"."organization_id",
    "discovered_rank_codes"."code",
    row_number() OVER (
      PARTITION BY "discovered_rank_codes"."organization_id"
      ORDER BY "discovered_rank_codes"."code"
    ) AS "rank_order"
  FROM discovered_rank_codes
  WHERE NOT EXISTS (
    SELECT 1
    FROM default_rank_codes
    WHERE upper("default_rank_codes"."code") = upper("discovered_rank_codes"."code")
  )
)
INSERT INTO "public"."organization_rank_catalog" (
  "organization_id",
  "code",
  "label",
  "service",
  "category",
  "pay_grade",
  "state",
  "source",
  "sort_order"
)
SELECT
  "unknown_rank_codes"."organization_id",
  "unknown_rank_codes"."code",
  "unknown_rank_codes"."code",
  'custom',
  'custom',
  'ungraded',
  'active',
  'discovered',
  10000 + "unknown_rank_codes"."rank_order"
FROM unknown_rank_codes
ON CONFLICT ("organization_id", "code") DO NOTHING;
