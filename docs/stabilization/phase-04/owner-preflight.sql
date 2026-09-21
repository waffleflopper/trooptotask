-- D01 preparation only. Read owner-preflight.md before use.
-- Tested only on an owned disposable synthetic replay. Remote execution requires
-- separate owner authorization. This never applies or authorizes a migration.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
DECLARE
  expected jsonb := $baseline${
  "public.organization_billing_snapshots": {
    "columns": {
      "cancel_at_period_end": {
        "type": "boolean",
        "not_null": true,
        "default": "false",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "canceled_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "cancellation_feedback": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "cancellation_reason": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "collection_status": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "commercial_plan": {
        "type": "text",
        "not_null": true,
        "default": "'free'::text",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "created_at": {
        "type": "timestamp with time zone",
        "not_null": true,
        "default": "now()",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "current_period_end": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "current_period_start": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "drift_detected": {
        "type": "boolean",
        "not_null": true,
        "default": "false",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "id": {
        "type": "uuid",
        "not_null": true,
        "default": "gen_random_uuid()",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "last_processed_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "last_reconciled_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "last_stripe_event_created_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "last_stripe_event_id": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "last_stripe_event_type": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "organization_id": {
        "type": "uuid",
        "not_null": true,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "reconciliation_result": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "source": {
        "type": "text",
        "not_null": true,
        "default": "'stripe'::text",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "stripe_customer_id": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "stripe_price_id": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "stripe_product_id": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "stripe_subscription_id": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "subscription_status": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "sync_status": {
        "type": "text",
        "not_null": true,
        "default": "'not_configured'::text",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "trial_end": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "updated_at": {
        "type": "timestamp with time zone",
        "not_null": true,
        "default": "now()",
        "identity": "",
        "generated": "",
        "acl": null
      }
    },
    "constraints": {
      "organization_billing_snapshots_cancellation_reason_check": [
        "CHECK (cancellation_reason IS NULL OR (cancellation_reason = ANY (ARRAY['canceled_by_retention_policy'::text, 'cancellation_requested'::text, 'payment_disputed'::text, 'payment_failed'::text])))",
        true
      ],
      "organization_billing_snapshots_commercial_plan_check": [
        "CHECK (commercial_plan = ANY (ARRAY['free'::text, 'team'::text, 'unit'::text]))",
        true
      ],
      "organization_billing_snapshots_source_check": [
        "CHECK (source = ANY (ARRAY['stripe'::text, 'gift'::text, 'billing_disabled'::text, 'legacy_organization'::text]))",
        true
      ],
      "organization_billing_snapshots_subscription_status_check": [
        "CHECK (subscription_status IS NULL OR (subscription_status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text, 'unpaid'::text, 'canceled'::text, 'incomplete'::text, 'incomplete_expired'::text, 'paused'::text])))",
        true
      ],
      "organization_billing_snapshots_sync_status_check": [
        "CHECK (sync_status = ANY (ARRAY['not_configured'::text, 'synced'::text, 'pending'::text, 'needs_reconciliation'::text, 'billing_disabled'::text]))",
        true
      ],
      "organization_billing_snapshots_organization_id_fkey": [
        "FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE",
        true
      ],
      "organization_billing_snapshots_pkey": [
        "PRIMARY KEY (id)",
        true
      ]
    },
    "indexes": {
      "public.organization_billing_snapshots_org_key": [
        "CREATE UNIQUE INDEX organization_billing_snapshots_org_key ON public.organization_billing_snapshots USING btree (organization_id)",
        true
      ],
      "public.organization_billing_snapshots_pkey": [
        "CREATE UNIQUE INDEX organization_billing_snapshots_pkey ON public.organization_billing_snapshots USING btree (id)",
        true
      ],
      "public.organization_billing_snapshots_subscription_idx": [
        "CREATE INDEX organization_billing_snapshots_subscription_idx ON public.organization_billing_snapshots USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL)",
        true
      ],
      "public.organization_billing_snapshots_sync_health_idx": [
        "CREATE INDEX organization_billing_snapshots_sync_health_idx ON public.organization_billing_snapshots USING btree (sync_status, drift_detected, updated_at DESC)",
        true
      ]
    },
    "triggers": {
      "organization_billing_snapshots_updated_at": [
        "CREATE TRIGGER organization_billing_snapshots_updated_at BEFORE UPDATE ON public.organization_billing_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()",
        "O"
      ]
    },
    "policies": {
      "Members can view organization billing snapshots": {
        "command": "r",
        "permissive": true,
        "roles": [
          "PUBLIC"
        ],
        "using": "public.is_org_member(organization_id)",
        "check": null
      },
      "Service role manages organization billing snapshots": {
        "command": "*",
        "permissive": true,
        "roles": [
          "PUBLIC"
        ],
        "using": "(auth.role() = 'service_role'::text)",
        "check": "(auth.role() = 'service_role'::text)"
      }
    },
    "relation": {
      "owner": "postgres",
      "rls": true,
      "force_rls": false,
      "acl": [
        "postgres=arwdDxtm/postgres",
        "service_role=arwdDxtm/postgres",
        "authenticated=r/postgres"
      ],
      "kind": "r",
      "options": null
    }
  },
  "public.stripe_webhook_events": {
    "columns": {
      "attempt_count": {
        "type": "integer",
        "not_null": true,
        "default": "0",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "created_at": {
        "type": "timestamp with time zone",
        "not_null": true,
        "default": "now()",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "data": {
        "type": "jsonb",
        "not_null": true,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "error": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "event_created_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "id": {
        "type": "text",
        "not_null": true,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "last_error": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "object_id": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "processed_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "processed": {
        "type": "boolean",
        "not_null": true,
        "default": "false",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "processing_result": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "processing_state": {
        "type": "text",
        "not_null": true,
        "default": "'retryable_failed'::text",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "secondary_dedupe_key": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "type": {
        "type": "text",
        "not_null": true,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "updated_at": {
        "type": "timestamp with time zone",
        "not_null": true,
        "default": "now()",
        "identity": "",
        "generated": "",
        "acl": null
      }
    },
    "constraints": {
      "stripe_webhook_events_attempt_count_check": [
        "CHECK (attempt_count >= 0)",
        true
      ],
      "stripe_webhook_events_processing_state_check": [
        "CHECK (processing_state = ANY (ARRAY['processed'::text, 'ignored'::text, 'retryable_failed'::text, 'permanently_failed'::text, 'superseded'::text]))",
        true
      ],
      "stripe_webhook_events_pkey": [
        "PRIMARY KEY (id)",
        true
      ]
    },
    "indexes": {
      "public.stripe_webhook_events_pkey": [
        "CREATE UNIQUE INDEX stripe_webhook_events_pkey ON public.stripe_webhook_events USING btree (id)",
        true
      ],
      "public.stripe_webhook_events_processing_state_idx": [
        "CREATE INDEX stripe_webhook_events_processing_state_idx ON public.stripe_webhook_events USING btree (processing_state, updated_at)",
        true
      ],
      "public.stripe_webhook_events_secondary_dedupe_idx": [
        "CREATE INDEX stripe_webhook_events_secondary_dedupe_idx ON public.stripe_webhook_events USING btree (secondary_dedupe_key, event_created_at) WHERE (secondary_dedupe_key IS NOT NULL)",
        true
      ]
    },
    "triggers": {
      "update_stripe_webhook_events_updated_at": [
        "CREATE TRIGGER update_stripe_webhook_events_updated_at BEFORE UPDATE ON public.stripe_webhook_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()",
        "O"
      ]
    },
    "policies": {
      "Service role only for webhooks": {
        "command": "*",
        "permissive": true,
        "roles": [
          "PUBLIC"
        ],
        "using": "false",
        "check": null
      }
    },
    "relation": {
      "owner": "postgres",
      "rls": true,
      "force_rls": false,
      "acl": [
        "postgres=arwdDxtm/postgres",
        "service_role=arwdDxtm/postgres"
      ],
      "kind": "r",
      "options": null
    }
  },
  "public.organization_checkout_attempts": {
    "columns": {
      "canceled_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "checkout_url": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "commercial_plan": {
        "type": "text",
        "not_null": true,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "completed_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "created_at": {
        "type": "timestamp with time zone",
        "not_null": true,
        "default": "now()",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "expires_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "id": {
        "type": "uuid",
        "not_null": true,
        "default": "gen_random_uuid()",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "organization_id": {
        "type": "uuid",
        "not_null": true,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "status": {
        "type": "text",
        "not_null": true,
        "default": "'in_progress'::text",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "stripe_checkout_session_id": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "stripe_customer_id": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "stripe_price_id": {
        "type": "text",
        "not_null": true,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "updated_at": {
        "type": "timestamp with time zone",
        "not_null": true,
        "default": "now()",
        "identity": "",
        "generated": "",
        "acl": null
      }
    },
    "constraints": {
      "organization_checkout_attempts_commercial_plan_check": [
        "CHECK (commercial_plan = ANY (ARRAY['team'::text, 'unit'::text]))",
        true
      ],
      "organization_checkout_attempts_status_check": [
        "CHECK (status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'canceled'::text, 'expired'::text, 'failed'::text]))",
        true
      ],
      "organization_checkout_attempts_organization_id_fkey": [
        "FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE",
        true
      ],
      "organization_checkout_attempts_pkey": [
        "PRIMARY KEY (id)",
        true
      ]
    },
    "indexes": {
      "public.organization_checkout_attempts_active_org_key": [
        "CREATE UNIQUE INDEX organization_checkout_attempts_active_org_key ON public.organization_checkout_attempts USING btree (organization_id) WHERE (status = 'in_progress'::text)",
        true
      ],
      "public.organization_checkout_attempts_org_status_expires_idx": [
        "CREATE INDEX organization_checkout_attempts_org_status_expires_idx ON public.organization_checkout_attempts USING btree (organization_id, status, expires_at)",
        true
      ],
      "public.organization_checkout_attempts_pkey": [
        "CREATE UNIQUE INDEX organization_checkout_attempts_pkey ON public.organization_checkout_attempts USING btree (id)",
        true
      ],
      "public.organization_checkout_attempts_session_key": [
        "CREATE UNIQUE INDEX organization_checkout_attempts_session_key ON public.organization_checkout_attempts USING btree (stripe_checkout_session_id) WHERE (stripe_checkout_session_id IS NOT NULL)",
        true
      ]
    },
    "triggers": {
      "organization_checkout_attempts_updated_at": [
        "CREATE TRIGGER organization_checkout_attempts_updated_at BEFORE UPDATE ON public.organization_checkout_attempts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()",
        "O"
      ]
    },
    "policies": {
      "Owners can create organization checkout attempts": {
        "command": "a",
        "permissive": true,
        "roles": [
          "PUBLIC"
        ],
        "using": null,
        "check": "public.is_org_owner(organization_id)"
      },
      "Owners can update organization checkout attempts": {
        "command": "w",
        "permissive": true,
        "roles": [
          "PUBLIC"
        ],
        "using": "public.is_org_owner(organization_id)",
        "check": "public.is_org_owner(organization_id)"
      },
      "Owners can view organization checkout attempts": {
        "command": "r",
        "permissive": true,
        "roles": [
          "PUBLIC"
        ],
        "using": "public.is_org_owner(organization_id)",
        "check": null
      },
      "Service role manages organization checkout attempts": {
        "command": "*",
        "permissive": true,
        "roles": [
          "PUBLIC"
        ],
        "using": "(auth.role() = 'service_role'::text)",
        "check": "(auth.role() = 'service_role'::text)"
      }
    },
    "relation": {
      "owner": "postgres",
      "rls": true,
      "force_rls": false,
      "acl": [
        "postgres=arwdDxtm/postgres",
        "service_role=arwdDxtm/postgres",
        "authenticated=arw/postgres"
      ],
      "kind": "r",
      "options": null
    }
  },
  "public.organization_plan_feature_overrides": {
    "columns": {
      "created_at": {
        "type": "timestamp with time zone",
        "not_null": true,
        "default": "now()",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "created_by": {
        "type": "uuid",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "expires_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "feature_key": {
        "type": "text",
        "not_null": true,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "id": {
        "type": "uuid",
        "not_null": true,
        "default": "gen_random_uuid()",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "organization_id": {
        "type": "uuid",
        "not_null": true,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "override_state": {
        "type": "text",
        "not_null": true,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "reason": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "revoked_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "revoked_by": {
        "type": "uuid",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      }
    },
    "constraints": {
      "organization_plan_feature_overrides_reason_length": [
        "CHECK (reason IS NULL OR char_length(reason) <= 500)",
        true
      ],
      "organization_plan_feature_overrides_state_check": [
        "CHECK (override_state = ANY (ARRAY['granted'::text, 'denied'::text]))",
        true
      ],
      "organization_plan_feature_overrides_created_by_fkey": [
        "FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL",
        true
      ],
      "organization_plan_feature_overrides_organization_id_fkey": [
        "FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE",
        true
      ],
      "organization_plan_feature_overrides_revoked_by_fkey": [
        "FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL",
        true
      ],
      "organization_plan_feature_overrides_pkey": [
        "PRIMARY KEY (id)",
        true
      ]
    },
    "indexes": {
      "public.idx_org_plan_feature_overrides_expiry": [
        "CREATE INDEX idx_org_plan_feature_overrides_expiry ON public.organization_plan_feature_overrides USING btree (expires_at) WHERE ((expires_at IS NOT NULL) AND (revoked_at IS NULL))",
        true
      ],
      "public.idx_org_plan_feature_overrides_org_feature_active": [
        "CREATE INDEX idx_org_plan_feature_overrides_org_feature_active ON public.organization_plan_feature_overrides USING btree (organization_id, feature_key, created_at DESC) WHERE (revoked_at IS NULL)",
        true
      ],
      "public.organization_plan_feature_overrides_pkey": [
        "CREATE UNIQUE INDEX organization_plan_feature_overrides_pkey ON public.organization_plan_feature_overrides USING btree (id)",
        true
      ],
      "public.uq_org_plan_feature_overrides_active": [
        "CREATE UNIQUE INDEX uq_org_plan_feature_overrides_active ON public.organization_plan_feature_overrides USING btree (organization_id, feature_key) WHERE (revoked_at IS NULL)",
        true
      ]
    },
    "triggers": {},
    "policies": {
      "Org members can read plan feature overrides": {
        "command": "r",
        "permissive": true,
        "roles": [
          "PUBLIC"
        ],
        "using": "(public.is_org_member(organization_id) OR public.is_platform_admin())",
        "check": null
      },
      "Service role can manage plan feature overrides": {
        "command": "*",
        "permissive": true,
        "roles": [
          "PUBLIC"
        ],
        "using": "(auth.role() = 'service_role'::text)",
        "check": "(auth.role() = 'service_role'::text)"
      }
    },
    "relation": {
      "owner": "postgres",
      "rls": true,
      "force_rls": false,
      "acl": [
        "postgres=arwdDxtm/postgres",
        "anon=arwdDxtm/postgres",
        "authenticated=arwdDxtm/postgres",
        "service_role=arwdDxtm/postgres"
      ],
      "kind": "r",
      "options": null
    }
  },
  "public.organizations": {
    "columns": {
      "current_period_end": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "gift_expires_at": {
        "type": "timestamp with time zone",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "gift_tier": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "gifted_by": {
        "type": "uuid",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "stripe_customer_id": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "stripe_subscription_id": {
        "type": "text",
        "not_null": false,
        "default": null,
        "identity": "",
        "generated": "",
        "acl": null
      },
      "subscription_status": {
        "type": "text",
        "not_null": false,
        "default": "'active'::text",
        "identity": "",
        "generated": "",
        "acl": null
      },
      "tier": {
        "type": "text",
        "not_null": true,
        "default": "'free'::text",
        "identity": "",
        "generated": "",
        "acl": null
      }
    },
    "constraints": {
      "organizations_gift_tier_check": [
        "CHECK (gift_tier IS NULL OR (gift_tier = ANY (ARRAY['team'::text, 'unit'::text])))",
        true
      ],
      "organizations_subscription_status_check": [
        "CHECK (subscription_status IS NULL OR (subscription_status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text, 'unpaid'::text, 'canceled'::text, 'incomplete'::text, 'incomplete_expired'::text, 'paused'::text])))",
        true
      ],
      "organizations_tier_check": [
        "CHECK (tier = ANY (ARRAY['free'::text, 'team'::text, 'unit'::text]))",
        true
      ],
      "organizations_gifted_by_fkey": [
        "FOREIGN KEY (gifted_by) REFERENCES auth.users(id)",
        true
      ]
    }
  }
}$baseline$;
  expected_functions jsonb := $baseline${
  "public.get_effective_tier(uuid)": {
    "definition_md5": "1cdabddd2c0e703b0023040418d51058",
    "owner": "postgres",
    "acl": [
      "=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres",
      "authenticated=X/postgres"
    ]
  },
  "public.record_retryable_stripe_webhook_event_attempt(text,text,jsonb,text,text,timestamp with time zone)": {
    "definition_md5": "3f7706d0333b1b5a56b7a6e11eeae371",
    "owner": "postgres",
    "acl": [
      "=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  "public.record_stripe_webhook_event_attempt(text,text,jsonb,text,text,timestamp with time zone)": {
    "definition_md5": "dad928b366ca683603f6fdef28d9c913",
    "owner": "postgres",
    "acl": [
      "=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  "public.cleanup_old_webhook_events()": {
    "definition_md5": "1ef8d6dc3c4ebf706bb25cd7e4157fe4",
    "owner": "postgres",
    "acl": [
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  "public.block_invitation_if_member_cap_exceeded(uuid,uuid,uuid,integer,text)": {
    "definition_md5": "c7fee4dc5038ef670805027c467d9a5e",
    "owner": "postgres",
    "acl": [
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  "public.list_platform_organization_tier_counts()": {
    "definition_md5": "2ac689c6b5d179866a910099ae5f80b1",
    "owner": "postgres",
    "acl": [
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  "public.upsert_organization_billing_snapshot_and_mirror_if_current(jsonb,jsonb,jsonb)": {
    "definition_md5": "b610339ed4cf1f723b850230b91ed5cd",
    "owner": "postgres",
    "acl": [
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  "public.upsert_organization_billing_snapshot_if_current(jsonb)": {
    "definition_md5": "8631c24276ff82bb39e840368a218eb5",
    "owner": "postgres",
    "acl": [
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  }
}$baseline$;
  commercial_columns text[] := ARRAY['tier','stripe_customer_id','stripe_subscription_id','subscription_status','current_period_end','gift_tier','gift_expires_at','gifted_by'];
  object record;
  relation_oid oid;
  actual jsonb;
  blockers text;
  reference_pattern text := '\m(organization_billing_snapshots|stripe_webhook_events|organization_checkout_attempts|organization_plan_feature_overrides|cleanup_old_webhook_events|get_effective_tier|record_stripe_webhook_event_attempt|record_retryable_stripe_webhook_event_attempt|upsert_organization_billing_snapshot_if_current|upsert_organization_billing_snapshot_and_mirror_if_current|block_invitation_if_member_cap_exceeded|list_platform_organization_tier_counts|tier|stripe_customer_id|stripe_subscription_id|subscription_status|current_period_end|gift_tier|gift_expires_at|gifted_by)\M';
BEGIN
  IF current_setting('transaction_read_only') <> 'on' OR NOT
     (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'BLOCKED: preflight requires read-only transaction and complete catalog/data visibility (postgres)';
  END IF;
  FOR object IN SELECT * FROM jsonb_each(expected_functions) LOOP
    SELECT jsonb_build_object('definition_md5',md5(pg_get_functiondef(p.oid)),
      'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) INTO actual
    FROM pg_proc p WHERE p.oid = to_regprocedure(object.key);
    IF actual IS DISTINCT FROM object.value THEN
      RAISE EXCEPTION 'BLOCKED: missing/changed RPC definition, owner or ACL: %', object.key;
    END IF;
  END LOOP;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO blockers
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN (SELECT split_part(split_part(key,'(',1),'.',2) FROM jsonb_object_keys(expected_functions) key)
    AND NOT expected_functions ? p.oid::regprocedure::text;
  IF blockers IS NOT NULL THEN RAISE EXCEPTION 'BLOCKED: unexpected commercial overloads: %', blockers; END IF;

  FOR object IN SELECT * FROM jsonb_each(expected) LOOP
    relation_oid := to_regclass(object.key);
    SELECT jsonb_object_agg(a.attname,jsonb_build_object(
      'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
      'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,
      'generated',a.attgenerated,'acl',a.attacl)) INTO actual
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=relation_oid AND a.attnum>0 AND NOT a.attisdropped
      AND (object.key <> 'public.organizations' OR a.attname=ANY(commercial_columns));
    IF actual IS DISTINCT FROM object.value->'columns' THEN
      RAISE EXCEPTION 'BLOCKED: missing/changed target column inventory: %',object.key;
    END IF;
    IF object.key = 'public.organizations' THEN
      SELECT coalesce(jsonb_object_agg(c.conname,jsonb_build_array(pg_get_constraintdef(c.oid,true),c.convalidated)),'{}')
        INTO actual FROM pg_constraint c WHERE c.conrelid=relation_oid AND c.conkey && ARRAY(
          SELECT a.attnum FROM pg_attribute a WHERE a.attrelid=relation_oid AND a.attname=ANY(commercial_columns));
      IF actual IS DISTINCT FROM object.value->'constraints' THEN
        RAISE EXCEPTION 'BLOCKED: changed Organization commercial constraints';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_depend d JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
        WHERE d.refclassid='pg_class'::regclass AND a.attrelid=relation_oid AND a.attname=ANY(commercial_columns)
          AND d.classid IN ('pg_class'::regclass,'pg_trigger'::regclass)) THEN
        RAISE EXCEPTION 'BLOCKED: unreviewed index/trigger depends on Organization commercial columns';
      END IF;
      CONTINUE;
    END IF;
    SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,
      'force_rls',c.relforcerowsecurity,'acl',c.relacl,'kind',c.relkind,'options',c.reloptions)
      INTO actual FROM pg_class c WHERE c.oid=relation_oid;
    IF actual IS DISTINCT FROM object.value->'relation' THEN
      RAISE EXCEPTION 'BLOCKED: changed target table ownership/RLS/ACL/kind/options: %',object.key;
    END IF;
    SELECT coalesce(jsonb_object_agg(c.conname,jsonb_build_array(pg_get_constraintdef(c.oid,true),c.convalidated)),'{}')
      INTO actual FROM pg_constraint c WHERE c.conrelid=relation_oid;
    IF actual IS DISTINCT FROM object.value->'constraints' THEN
      RAISE EXCEPTION 'BLOCKED: changed target constraints: %',object.key;
    END IF;
    SELECT coalesce(jsonb_object_agg(i.indexrelid::regclass::text,jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid)),'{}')
      INTO actual FROM pg_index i WHERE i.indrelid=relation_oid;
    IF actual IS DISTINCT FROM object.value->'indexes' THEN
      RAISE EXCEPTION 'BLOCKED: changed target indexes: %',object.key;
    END IF;
    SELECT coalesce(jsonb_object_agg(t.tgname,jsonb_build_array(pg_get_triggerdef(t.oid,true),t.tgenabled)),'{}')
      INTO actual FROM pg_trigger t WHERE t.tgrelid=relation_oid AND NOT t.tgisinternal;
    IF actual IS DISTINCT FROM object.value->'triggers' THEN
      RAISE EXCEPTION 'BLOCKED: changed target triggers: %',object.key;
    END IF;
    SELECT coalesce(jsonb_object_agg(p.polname,jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,
      'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY r) FROM unnest(p.polroles) r),
      'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))),'{}')
      INTO actual FROM pg_policy p WHERE p.polrelid=relation_oid;
    IF actual IS DISTINCT FROM object.value->'policies' THEN
      RAISE EXCEPTION 'BLOCKED: changed target policies: %',object.key;
    END IF;
  END LOOP;

  -- Follow automatic/internal dependents as PostgreSQL would for exact drops.
  -- A normal edge outside this closure requires review, including nonpublic
  -- views, FKs and callers through an automatically owned table row type.
  WITH RECURSIVE targets(classid,objid,objsubid) AS (
    SELECT 'pg_class'::regclass::oid,to_regclass(key)::oid,0 FROM jsonb_object_keys(expected) key WHERE key <> 'public.organizations'
    UNION ALL SELECT 'pg_proc'::regclass::oid,to_regprocedure(key)::oid,0 FROM jsonb_object_keys(expected_functions) key
    UNION ALL SELECT 'pg_class'::regclass::oid,a.attrelid,a.attnum::integer FROM pg_attribute a
      WHERE a.attrelid='public.organizations'::regclass AND a.attname=ANY(commercial_columns)
  ), removal(classid,objid,objsubid) AS (
    SELECT * FROM targets
    UNION
    SELECT d.classid,d.objid,d.objsubid FROM pg_depend d JOIN removal r
      ON d.refclassid=r.classid AND d.refobjid=r.objid AND (r.objsubid=0 OR d.refobjsubid=r.objsubid)
      WHERE d.deptype IN ('a','i')
  )
  SELECT string_agg(DISTINCT pg_describe_object(d.classid,d.objid,d.objsubid)||' -> '||pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid), E'\n')
    INTO blockers FROM pg_depend d JOIN removal r
      ON d.refclassid=r.classid AND d.refobjid=r.objid AND (r.objsubid=0 OR d.refobjsubid=r.objsubid)
    WHERE NOT EXISTS (SELECT 1 FROM removal x WHERE x.classid=d.classid AND x.objid=d.objid AND (x.objsubid=0 OR x.objsubid=d.objsubid))
      -- Automatic ownership is not approval to delete a newly discovered object.
      -- Exact constraint/index/policy/trigger/default definitions were checked
      -- above; the baseline has no rules, extended statistics, owned sequences,
      -- or inherited/partitioned commercial children.
      OR d.classid NOT IN ('pg_class'::regclass,'pg_type'::regclass,'pg_constraint'::regclass,
                          'pg_attrdef'::regclass,'pg_policy'::regclass,'pg_trigger'::regclass)
      OR (d.classid='pg_class'::regclass AND EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=d.objid
            AND c.relkind NOT IN ('i','t') AND NOT expected ? c.oid::regclass::text));
  IF blockers IS NOT NULL THEN RAISE EXCEPTION 'BLOCKED: unreviewed inbound dependencies: %',blockers; END IF;

  SELECT string_agg(p.oid::regprocedure::text,', ') INTO blockers FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND p.prokind IN ('f','p','w') AND NOT expected_functions ? p.oid::regprocedure::text
      AND pg_get_functiondef(p.oid) ~* reference_pattern;
  IF blockers IS NOT NULL THEN RAISE EXCEPTION 'BLOCKED: unclassified routine body references: %',blockers; END IF;
  SELECT string_agg(jobname,', ') INTO blockers FROM cron.job WHERE command ~* reference_pattern;
  IF blockers IS NOT NULL THEN RAISE EXCEPTION 'BLOCKED: commercial cron callers: %',blockers; END IF;
  IF EXISTS (SELECT 1 FROM pg_publication WHERE puballtables)
     OR EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname='public' AND tablename IN ('organization_billing_snapshots','stripe_webhook_events','organization_checkout_attempts','organization_plan_feature_overrides')) THEN
    RAISE EXCEPTION 'BLOCKED: commercial tables are published; disposition replication consumers first';
  END IF;
END
$preflight$;
-- Counts are information for explicit owner disposition, NEVER evidence of
-- emptiness or permission to delete populated financial/history records.
SELECT jsonb_build_object(
  'organization_billing_snapshots',(SELECT count(*) FROM public.organization_billing_snapshots),
  'stripe_webhook_events',(SELECT count(*) FROM public.stripe_webhook_events),
  'organization_checkout_attempts',(SELECT count(*) FROM public.organization_checkout_attempts),
  'organization_plan_feature_overrides',(SELECT count(*) FROM public.organization_plan_feature_overrides),
  'organization_commercial_nonnull',(SELECT jsonb_build_object('tier',count(tier),'stripe_customer_id',count(stripe_customer_id),'stripe_subscription_id',count(stripe_subscription_id),'subscription_status',count(subscription_status),'current_period_end',count(current_period_end),'gift_tier',count(gift_tier),'gift_expires_at',count(gift_expires_at),'gifted_by',count(gifted_by)) FROM public.organizations),
  'status','CATALOG MATCH ONLY; owner disposition/backup/caller shutdown/recovery still required');
ROLLBACK;
