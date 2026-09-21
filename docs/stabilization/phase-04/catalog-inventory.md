# Effective pre-retirement catalog

Phase 04 / [D01 #1309](https://github.com/waffleflopper/trooptotask/issues/1309), leaf **04-01b-01**. This classifies the effective **local synthetic replay**, not production. No retirement has happened. Schema/TypeScript generation belongs to **04-01b-02**; the populated upgrade baseline, exact owner preflight and recovery prerequisites belong to **04-01c**. D02 owns the complete removal and all affected consumers.

## Provenance and reproduction

[catalog.sql](catalog.sql) reads metadata in a read-only transaction. [catalog-baseline.json](catalog-baseline.json) contains its two JSON results merged into one object, without filtering any returned class. It includes complete public definitions and nonpublic SQL/PLpgSQL bodies, ACLs, both directions of dependencies touching public objects, external FKs into public relations, triggers invoking public functions, and provider event-trigger bodies. This is a review artifact, not a schema to apply or generated application types. [catalog-result.json](catalog-result.json) records checks and hashes; [execution evidence](../EVIDENCE.md#task-04-01b-01--effective-catalog-discovery-and-classification) records the candidate and limitations.

Reproduce the [replay guide](replay-baseline.md) with a **new** directory/project and verified unused ports. This run changes `t3-phase04-01a-final` to `t3-phase04-01b-01`, 60320–60327/60329 to 60420–60427/60429, 24383 to 24483, and the configuration offset from `old + 4000` to `old + 4100`. All refusal checks, the pinned PostgreSQL image `17.6.1.155`, seeds disabled with empty paths, the 154 [input hashes](replay-inputs.sha256), and the minimal startup environment stay intact. Do not reuse this project's stopped workspace: allocate a new project/directory/ports for a later run. Never copy seed data, environment files or remote links.

Recorded commands use `/tmp/t3-phase04-01b-01/isolated`, project `t3-phase04-01b-01`, Supabase 2.101.0, PostgreSQL/psql 17.6, Node 24.18.0 and npm 11.12.1:

```bash
supabase start --workdir /tmp/t3-phase04-01b-01/isolated
```

Execute `npm run db:test` **from that isolated directory**, as in the replay guide. Confirm the exact 133-version migration ledger and unchanged public-table/auth-user digests. Then, from the repository root, after verifying this container belongs to the newly created project:

```bash
python - <<'PY'
from pathlib import Path
import json, subprocess

query = Path('docs/stabilization/phase-04/catalog.sql').read_text()
command = ['docker', 'exec', '-i', 'supabase_db_t3-phase04-01b-01',
           'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres',
           '-v', 'ON_ERROR_STOP=1']
result = subprocess.run(command, input=query, text=True, capture_output=True, check=True)
catalog, environment = [json.loads(line) for line in result.stdout.splitlines()]
Path('/tmp/t3-phase04-01b-01/catalog.json').write_text(
    json.dumps({**catalog, **environment}, indent=2) + '\n')
PY
```

Capture occurs after all 19 unchanged SQL suites pass. Repeat capture after the rollback probes below; decoded JSON is identical. Internal FK trigger names and TOAST descriptions contain replay-specific OIDs: compare their logical relationships when comparing different fresh projects, not raw names. Catalog ordering and raw file hashes are receipts for this run, not cross-instance identity contracts.

Clean up only the new project after verification:

```bash
supabase stop --workdir /tmp/t3-phase04-01b-01/isolated --project-id t3-phase04-01b-01 --no-backup
```

Confirm its containers/volumes/network are gone and pre-existing container IDs/states are unchanged. Raw setup/start/test/probe/check/cleanup logs stay under `/tmp/t3-phase04-01b-01/`; startup credentials are not published.

## Scope and discovery

The snapshot covers 68 public tables, 799 columns, 103 public functions, 48 nonpublic SQL/PLpgSQL functions, 384 constraints, 241 indexes, 175 policies, 575 triggers including internal FK triggers, 144 types including table row/array types, 3,674 dependency edges, 614 role dependency entries, 309 effective role/function EXECUTE results, 30 default ACLs, 12 schema ACLs, seven extensions and eight provider event triggers. Four public enums are retained: `announcement_type`, `ict_validation_method`, `invitation_status`, `organization_role`. There are zero public views/materialized views, cron jobs or foreign servers. The realtime publication is not all-tables and has no table membership. Empty classes are explicit in the snapshot's count fields or described here; missing JSON sections from the aggregate mean zero rows, not an unrun query.

Review combined all function bodies, object definitions and non-text edges with final migration revisions and concrete TypeScript/SQL callers. SQL and PL/pgSQL string bodies can have runtime references absent from `pg_depend`; an empty inbound edge list alone is not safe-removal evidence. The discovery candidates were not an allowlist: all captured public and nonpublic bodies were reviewed. A controlled transaction created a view in a new nonpublic schema referencing `organizations.gift_tier`, plus a nonpublic PL/pgSQL caller of `cleanup_old_webhook_events()`. The unchanged query detected both the inbound view edge and the string-body reference; rollback removed the probe schema, and the original catalog was reproduced exactly.

## Commercial tables and owned objects

All four tables are RLS-enabled, owned by `postgres`, without forced RLS. The JSON preserves every column/default, exact constraint/index definition, policy expression/role, trigger and ACL. Their 65 columns, 20 constraints, 15 indexes, nine policies and three user triggers retire with these tables; table row/array types, internal FK/TOAST objects and owned defaults are subordinate objects, not permission for broad `CASCADE`. No retained table has an FK into a commercial table.

| Table (`public`)                      | Columns / constraints / indexes / policies | Effective direct application-role grants                          | Shared outgoing references                                                |
| ------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `organization_billing_snapshots`      | 27 / 7 / 4 / 2                             | authenticated SELECT; service role all; anon none                 | `organizations(id)` FK; member admission policy; shared timestamp trigger |
| `stripe_webhook_events`               | 15 / 3 / 3 / 1                             | service role all; authenticated/anon none                         | shared timestamp trigger; no FK                                           |
| `organization_checkout_attempts`      | 13 / 4 / 4 / 4                             | authenticated SELECT/INSERT/UPDATE; service role all; anon none   | `organizations(id)` FK; owner policies; shared timestamp trigger          |
| `organization_plan_feature_overrides` | 10 / 6 / 4 / 2                             | anon/authenticated/service role all table privileges (`arwdDxtm`) | Organization FK; `auth.users` creator/revoker FKs; member/platform policy |

The override grants are **not SELECT-only**: earlier broad defaults survive a later SELECT grant. Its RLS policies still constrain row access, so grants alone do not establish successful writes. PUBLIC-targeted policies likewise do not replace table grants. Keep ACL and policy evidence separate.

Retire only `organization_billing_snapshots_updated_at`, `organization_checkout_attempts_updated_at` and `update_stripe_webhook_events_updated_at`. Preserve `update_updated_at_column()` and its 15 retained user-trigger consumers. No extra commercial trigger, enum, view, job or external FK appeared in this replay. Provider event triggers contain generic schema-cache/GraphQL/extension operations, not commercial logic; none requires a billing-specific rewrite.

## Organization fields

The eight commercial columns are `tier`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `current_period_end`, `gift_tier`, `gift_expires_at`, `gifted_by`. Their directly attached catalog dependencies are three checks (`organizations_tier_check`, `organizations_gift_tier_check`, `organizations_subscription_status_check`), `organizations_gifted_by_fkey`, defaults on `tier` and `subscription_status`, and internal FK plumbing. No additional index, policy, retained view or stored dependency requires these fields. Function-body references are covered separately below.

Preserve all other Organization fields, including suspension, archive/retention and `personnel_document_storage_cap_bytes`. The latter is a technical file bound still enforced by `enforce_personnel_document_storage_cap()`. Preserve `platform_admins_role_check` and stored role `billing`: current admin access handling retains identity/dashboard admission and denies other pages; no role promotion or stored-identity deletion is authorized.

## Exact active RPC signatures and ACLs

All identities below are in `public`. All eight allow service-role execution. The five marked service-only deny both anon and authenticated execution in the catalog. All are SECURITY DEFINER except the tier-count SQL function. The receipt includes exact owners, search paths, defaults and bodies.

| Exact signature                                                                                     | Effective execution / classification                                                             |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `cleanup_old_webhook_events()`                                                                      | service-only; commercial ledger cleanup                                                          |
| `get_effective_tier(uuid)`                                                                          | PUBLIC EXECUTE; commercial tier policy with internal service/platform/member admission           |
| `record_stripe_webhook_event_attempt(text,text,jsonb,text,text,timestamp with time zone)`           | PUBLIC EXECUTE; unguarded commercial ledger writer, exposure below                               |
| `record_retryable_stripe_webhook_event_attempt(text,text,jsonb,text,text,timestamp with time zone)` | PUBLIC EXECUTE; unguarded commercial ledger writer, exposure below                               |
| `upsert_organization_billing_snapshot_if_current(jsonb)`                                            | service-only; commercial snapshot writer                                                         |
| `upsert_organization_billing_snapshot_and_mirror_if_current(jsonb,jsonb,jsonb)`                     | service-only; snapshot and Organization commercial-field writer; third argument defaults to NULL |
| `block_invitation_if_member_cap_exceeded(uuid,uuid,uuid,integer,text)`                              | service-only; commercial cap enforcement that mutates retained invitation state                  |
| `list_platform_organization_tier_counts()`                                                          | service-only, SECURITY INVOKER; commercial aggregation                                           |

The two-argument mirror overload is absent, explicitly dropped by `20260615000100_billing_snapshot_mirror_event_position.sql`. No other overload is active. The effective-tier body is from `20260523000600`, the cancellation-aware snapshot writer from `20260524000700`, and the final mirror writer from `20260615000100`; earlier migration definitions are history.

**Confirmed local exposure, owned by D02 removal:** both ledger RPCs retain `=X/postgres` (PUBLIC EXECUTE), run as postgres SECURITY DEFINER and contain no actor/role admission check. Revoking direct anon/authenticated grants did not revoke PUBLIC. In a transaction on this disposable replay, `SET LOCAL ROLE anon`, followed by the first RPC and then the retry RPC with ID `synthetic-catalog-probe`, returned attempt counts **1** and **2**. Rollback left **zero** matching rows. This is a real anonymous-role write, not a claim based solely on grants. D02 must remove both exact signatures and their exposure; pre-retirement inventory acceptance is not security acceptance. The separate tier RPC has its internal admission check; its PUBLIC execute grant does not establish anonymous data access. Production exposure is **UNVERIFIED**; no remote query or change occurred.

## Retained operations and consumers

No retained effective body needs a commercial rewrite in this replay. The retiring routines call shared operations; dropping their callers does not authorize dropping shared dependencies. The complete D02 migration must recheck this conclusion against its actual target and stop for any unexpected dependency.

| Boundary                      | Retained objects / concrete consumer evidence                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Organization/Group authority  | `is_org_member`, `is_org_owner`, `is_platform_admin`, capability/scope helpers, memberships and Personnel. Effective-tier reads Personnel and member/platform admission; commercial-table policies also reference these helpers. Preserve R1/R5.                                                                                                                                                                                     |
| Invitation blocking/rejection | The member-cap routine locks/counts memberships and distinct pending invitations, then writes `status`, `blocked_at`, `blocked_by`; it contains no billing-table reference. Keep those fields and `invitation_status.blocked`, which `reject_access_request_and_block_linked_invitations(uuid,uuid)` still uses with Access Requests and audit. Preserve rejection/setup provenance and F01's later repair ownership.                |
| Acceptance and transitions    | Final `accept_organization_invitation(uuid)` from `20260629000100` validates identity, email, status and completed approved setup, then creates scoped membership and records acceptance. Retained callers: `supabaseDashboardOrgAccess.ts:107`, `auto-accept-org-invites.ts:44`; decline/revoke callers remain in the dashboard/member-management adapters. No commercial helper is called.                                         |
| Provisioning                  | `create_org_with_owner(text)` validates authenticated actor/name and inserts Organization `(name,created_by)` plus normalized owner membership. `supabaseOrgProvisioning.ts:16` calls it before retained email/Group/Calendar/rank defaults. `transfer_org_ownership(uuid,uuid)` remains in settings administration. Preserve R2–R4.                                                                                                 |
| Suspension, exports and audit | Keep `is_user_suspended`, user/Organization suspension fields, export lifecycle/audit/outbox and `can_manage_org_members`. Export INSERT policy from `20260920000100` validates manager and requesting actor. `organizationExport.ts:46` selects retained Organization fields; `organizationDataExportManifest.ts:66` includes retained data families. `can_export_organization_data(uuid)` also remains a rank-catalog read helper. |
| Calendar and operational data | Keep daily person/Group assignments, availability, types, dates/identities/audit, Personnel `clinic_role`, independent Sign-In Rosters, training/ICT/onboarding and technical file/batch/rate bounds. No retirement target is a retained Calendar relation. Populated before/after comparison remains 04-01c/D02, not this empty replay.                                                                                             |

Paths above are relative to `src/lib/server/adapters/` or `src/lib/server/core/useCases/` unless explicitly named otherwise. The final JSON bodies are the catalog evidence; source anchors describe actual consumers rather than inferred TypeScript dependencies. No production TypeScript caller of the four tables/eight RPCs remains. Adversarial commercial fields in `handle.test.ts` and `organizationExport.test.ts` are exclusion regressions, not runtime callers. `src/hooks.organizationAdmission.test.ts:52` also retains an unused `organization_plan_feature_overrides: []` transport-fixture entry; D02 must delete that obsolete fixture entry without weakening admission assertions. D02 deletes billing-only `organization_billing_snapshots_rls.sql` and removes only the six cleanup/member-cap existence-dependent assertions in `sensitive_rpc_privileges.sql`; shared privilege assertions and all retained SQL tests remain protected.

**Separate recorded discovery:** `is_full_editor_for_org(uuid)` is a surviving noncommercial SQL function whose string body references removed membership columns such as `scoped_group_id` and old `can_view_*` fields. Current source and effective bodies show no retained caller or inbound dependency. Invocation validity is **UNVERIFIED**, not passed by this inventory. Task 13-01 owns its explicit residual-helper disposition before phase 14; this does not expand D02's commercial cutover or authorize preserving it at program completion.

## Limits and next boundary

The discovery covers this immutable chain and pinned local provider image. Remote custom objects, roles, jobs, old binaries and external callers remain unknown. D02 must use exact signatures and narrow removal order, preserve shared helpers/data, remove obsolete SQL tests/consumers and regenerate actual schema/types. 04-01c owns executable owner preflight and populated baseline; unknown remote dependencies or ambiguous shared data block the affected destructive operation. No blanket JSON/metadata deletion, compatibility stub or broad DROP CASCADE is permitted.

R1–R7 source and stored-data contracts are unchanged; R8 retirement remains incomplete. There is no changed user journey or browser requirement for this metadata leaf. Vercel push/merge may deploy, repository CI remains manual and no automatic remote migration is configured. Owner verification of external deployment settings, notice/backups and application/schema compatibility precedes a releasing merge. No Git publication, remote database operation or production readiness is implied.
