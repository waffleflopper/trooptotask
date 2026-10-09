# V1 Drift Ledger

This is the current register of unresolved architectural gaps. The [ownership inventory](CURRENT_OWNERSHIP.md) identifies concrete migration packets; [TODO](../stabilization/TODO.md) owns execution order. Recording debt does not authorize new exceptions or establish acceptance. Remove resolved narratives after preserving concise acceptance evidence and a committed reference under the [evidence contract](DEFINITION_OF_DONE.md#recording-evidence).

## D-02 Provider-Boundary Leaks — resolved

Phase 08 D01–D30 are accepted and integrated on `8072a9efbfb3438da415ac6681eeee8666b44860`. The legacy core, private ownership cutovers and route-provider exceptions described in this ledger are removed. Governance reports zero findings; its [enforcement and limits](GOVERNANCE_CHECKS.md) do not establish independently inspected production state. Current Supabase Auth, SQL/RLS, Storage and transaction guarantees remain supported infrastructure.

The [Phase 08 acceptance](../stabilization/EVIDENCE.md#phase-08-integrated-phase-check) records the complete deliverable map, retained failures and schema/security proof. [The committed ledger](https://github.com/waffleflopper/trooptotask/blob/8072a9efbfb3438da415ac6681eeee8666b44860/docs/architecture/DRIFT_LEDGER.md) preserves the historical cutover narratives. Hosted application of the D03 Onboarding `20260926000200` and Training `20260926000300` repairs remains [unconfirmed](../stabilization/RELEASE.md#phase-08-d03-onboarding-and-training-application-confirmation). These confirmations and other hosted migration, preflight and deployment/drain obligations remain in RELEASE; merged ownership deliverables are not pending work.

Shared UI provenance, layer placement and interaction work remain Phase 09; retained consumer migration remains Phase 10. Follow [TODO](../stabilization/TODO.md) for their dependencies. Coordination-heavy modules may still warrant a focused performance or correctness repair when measured behavior demonstrates a need; module size alone does not reopen the completed ownership cutovers. [Module conventions](MODULE_CONVENTIONS.md) govern those repairs.

## D-05 Legacy Clinic Vocabulary

`clinicRole` / `clinic_role` remain retained Personnel fields. Their canonical user-facing term is **Duty Role**; some surfaces still use clinic-era or ambiguous `Role` labels. Preserve existing data, runtime/API shapes and tolerated legacy import labels while using canonical copy in new work. [ADR 0006](adrs/0006-legacy-terminology-compatibility-policy.md) owns this compatibility rule.

A repo-wide runtime/schema rename remains an explicitly approved future decision, including migration sequencing and import/export compatibility; documentation cleanup does not authorize it.

## D-09 Automatic CI validation — implemented

The separately authorized [CI workflow](../ci.md) preserves PR/main triggers, conservative change selection, full application checks and isolated database contracts. Its maintained configuration and exact hosted receipts are recorded there; configured triggers alone do not establish a successful run for a new candidate. Task **11-04** retains the separate local CSP issue.

Robert explicitly accepts an unprotected private `main` on the existing GitHub plan, with owner review of CI results before merge. Paid branch protection and rulesets are not requirements, defects or reasons for a red check. Existing source/governance, security and test controls remain required; failed validation still blocks acceptance. The module checker supplements route/provider/permission controls and does not certify runtime behavior or hosted deployment state.

## D-10 No Rescind Lever For Auto-Approved Platform Access

An Access Request auto-approved from an Organization Invitation (ADR 0012) cannot have platform access withdrawn between approval and setup completion. `reject` operates only on pending requests; manual Account Setup Link revocation is unimplemented. A fatal setup-link issuance failure can leave approval behind, allowing `/auth/renew-invite` to issue a credential even though the invitation did not complete. Reviewed-request provenance is visibility, not remediation.

F01 / task **11-01** owns coherent issuance, renewal and rescind transitions with concurrency-safe provenance. Preserve independent approvals, sibling Organization grants and existing accounts. Acceptance must cover fatal issuance failure, renewal, rejection/rescind, concurrent invitations and independent approvals with deterministic clocks and failure cases. Billing removal and this documentation consolidation do not close F01.

## Authorization decisions during remediation

[Authorization and provider boundaries](AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md) owns the current role, capability, shared-scope and sensitive-action model; ADRs 0001/0002 own its rationale. Resolve any consequential per-feature `operate`/`configure` or denied-access audit choice at the affected policy boundary before implementation. Existing lane independence is binding; an unresolved choice is not permission to borrow another lane. Follow the [decision boundaries](AI_AGENT_OPERATING_MODEL.md#decision-boundaries).

Historical template/step and later lane repairs retain their schema/security proof in [EVIDENCE](../stabilization/EVIDENCE.md) and owner-confirmation limits in [RELEASE](../stabilization/RELEASE.md). Their merged application acceptance does not establish independent production inspection. Preserve outstanding release obligations separately from resolved code ownership.
