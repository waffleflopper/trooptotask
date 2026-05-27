-- Final member-access normalization before app code stops reading legacy compatibility columns.
-- Replacement-native Operator and multi-Group rows keep their stored preset and overrides
-- because legacy booleans cannot represent operate-level authority.
-- Other preset and capability storage is re-derived from the current legacy lane flags.
-- Existing non-empty replacement Scope Sets win; scoped_group_id is only a scope fallback.
UPDATE "public"."organization_memberships"
SET
  "member_preset" = CASE
    WHEN "scoped_group_id" IS NULL
      AND ("member_preset" = 'operator' OR array_length("access_scope_group_ids", 1) > 0) THEN "member_preset"
    WHEN "scoped_group_id" IS NOT NULL THEN 'operator'
    WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks"
      AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'editor'
    WHEN "can_view_calendar" AND NOT "can_edit_calendar" AND "can_view_personnel" AND NOT "can_edit_personnel"
      AND "can_view_training" AND NOT "can_edit_training" AND "can_view_critical_tasks" AND NOT "can_edit_critical_tasks"
      AND "can_view_onboarding" AND NOT "can_edit_onboarding" AND "can_view_rating_scheme" AND NOT "can_edit_rating_scheme" THEN 'viewer'
    ELSE 'viewer'
  END,
  "capability_overrides" = CASE
    WHEN "scoped_group_id" IS NOT NULL THEN "capability_overrides"
    WHEN "member_preset" = 'operator' OR array_length("access_scope_group_ids", 1) > 0 THEN "capability_overrides"
    ELSE jsonb_strip_nulls(jsonb_build_object(
      'calendar', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_calendar",
        "can_edit_calendar"
      ),
      'personnel', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_personnel",
        "can_edit_personnel"
      ),
      'training', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_training",
        "can_edit_training"
      ),
      'criticalTasks', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_critical_tasks",
        "can_edit_critical_tasks"
      ),
      'onboarding', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_onboarding",
        "can_edit_onboarding"
      ),
      'ratingScheme', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_rating_scheme",
        "can_edit_rating_scheme"
      )
    ))
  END,
  "access_scope_kind" = CASE
    WHEN array_length("access_scope_group_ids", 1) > 0 THEN 'groups'
    WHEN "scoped_group_id" IS NOT NULL THEN 'groups'
    ELSE 'organization'
  END,
  "access_scope_group_ids" = CASE
    WHEN array_length("access_scope_group_ids", 1) > 0 THEN "access_scope_group_ids"
    WHEN "scoped_group_id" IS NOT NULL THEN ARRAY["scoped_group_id"]
    ELSE ARRAY[]::uuid[]
  END;

UPDATE "public"."organization_invitations"
SET
  "member_preset" = CASE
    WHEN "scoped_group_id" IS NULL
      AND ("member_preset" = 'operator' OR array_length("access_scope_group_ids", 1) > 0) THEN "member_preset"
    WHEN "scoped_group_id" IS NOT NULL THEN 'operator'
    WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks"
      AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'editor'
    WHEN "can_view_calendar" AND NOT "can_edit_calendar" AND "can_view_personnel" AND NOT "can_edit_personnel"
      AND "can_view_training" AND NOT "can_edit_training" AND "can_view_critical_tasks" AND NOT "can_edit_critical_tasks"
      AND "can_view_onboarding" AND NOT "can_edit_onboarding" AND "can_view_rating_scheme" AND NOT "can_edit_rating_scheme" THEN 'viewer'
    ELSE 'viewer'
  END,
  "capability_overrides" = CASE
    WHEN "scoped_group_id" IS NOT NULL THEN "capability_overrides"
    WHEN "member_preset" = 'operator' OR array_length("access_scope_group_ids", 1) > 0 THEN "capability_overrides"
    ELSE jsonb_strip_nulls(jsonb_build_object(
      'calendar', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_calendar",
        "can_edit_calendar"
      ),
      'personnel', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_personnel",
        "can_edit_personnel"
      ),
      'training', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_training",
        "can_edit_training"
      ),
      'criticalTasks', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_critical_tasks",
        "can_edit_critical_tasks"
      ),
      'onboarding', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_onboarding",
        "can_edit_onboarding"
      ),
      'ratingScheme', "public"."member_access_capability_override"(
        CASE WHEN "scoped_group_id" IS NOT NULL THEN 'operate' WHEN "can_edit_calendar" AND "can_edit_personnel" AND "can_edit_training" AND "can_edit_critical_tasks" AND "can_edit_onboarding" AND "can_edit_rating_scheme" THEN 'configure' ELSE 'view' END,
        "can_view_rating_scheme",
        "can_edit_rating_scheme"
      )
    ))
  END,
  "access_scope_kind" = CASE
    WHEN array_length("access_scope_group_ids", 1) > 0 THEN 'groups'
    WHEN "scoped_group_id" IS NOT NULL THEN 'groups'
    ELSE 'organization'
  END,
  "access_scope_group_ids" = CASE
    WHEN array_length("access_scope_group_ids", 1) > 0 THEN "access_scope_group_ids"
    WHEN "scoped_group_id" IS NOT NULL THEN ARRAY["scoped_group_id"]
    ELSE ARRAY[]::uuid[]
  END;
