# V1 Drift Ledger

This is the current register of unresolved architectural gaps. The [ownership inventory](CURRENT_OWNERSHIP.md) identifies concrete migration packets; [TODO](../stabilization/TODO.md) owns execution order. Recording debt does not authorize new exceptions or establish acceptance. Remove resolved narratives after preserving concise acceptance evidence and a committed reference under the [evidence contract](DEFINITION_OF_DONE.md#recording-evidence).

## D-02 Provider-Boundary Leaks

The route baseline retains 15 `locals.supabase` auth edges and 17 admin/provider wiring entries. These classifications do not make all current wiring the target architecture. [Governance checks](GOVERNANCE_CHECKS.md) describe their exact enforcement and limits; the Phase 08 inventory also owns remaining cross-module and provider leaks. Current Supabase Auth, SQL/RLS, Storage and transaction guarantees remain supported infrastructure.

Move business policy outside owned auth/provider adapters behind narrow feature operations, following [ADR 0004](adrs/0004-v1-provider-boundary-contract.md) and [ADR 0013](adrs/0013-v1-module-and-delivery-contract.md). Complete each consumer cutover before removing its baseline entry. Do not add exceptions or reclassify remaining violations to pass governance.

## D-05 Legacy Clinic Vocabulary

`clinicRole` / `clinic_role` remain retained Personnel fields. Their canonical user-facing term is **Duty Role**; some surfaces still use clinic-era or ambiguous `Role` labels. Preserve existing data, runtime/API shapes and tolerated legacy import labels while using canonical copy in new work. [ADR 0006](adrs/0006-legacy-terminology-compatibility-policy.md) owns this compatibility rule.

A repo-wide runtime/schema rename remains an explicitly approved future decision, including migration sequencing and import/export compatibility; documentation cleanup does not authorize it.

## D-07 Large Orchestration Modules

Calendar, Dashboard, Personnel and Training still have coordination-heavy modules and unfinished ownership/import cutovers. [CURRENT_OWNERSHIP](CURRENT_OWNERSHIP.md) records the actual source graph and packet owners; [module conventions](MODULE_CONVENTIONS.md) and ADR 0013 define the chosen public, portable, web and server seams. Phase 07 establishes and pilots these boundaries; Phase 08 completes the remaining consumers. Existing read-model, range-coordinator and shared domain seams are useful foundations, not proof that the full graph complies.

Deepen only the authorized boundary, preserve retained behavior and remove replaced central paths and compatibility facades with their callers. A passing regression check still reports existing Phase 08 debt.

## D-09 Missing Automatic CI Enforcement

CI defines format, lint, governance, type, test and build checks, but its `workflow_dispatch` trigger does not enforce automatic PR checks. Hosted Actions was reported disabled during prior verification; passing local checks or Vercel checks do not establish hosted CI acceptance. F03 / task **11-04** owns this unresolved enforcement gap.

The module checker added by [PR #1341](https://github.com/waffleflopper/trooptotask/pull/1341) supplements the route/provider/permission controls. It does not close F03 or certify architectural correctness. Preserve scan coverage and retained checks; do not change deployment or CI settings as incidental documentation maintenance.

## D-10 No Rescind Lever For Auto-Approved Platform Access

An Access Request auto-approved from an Organization Invitation (ADR 0012) cannot have platform access withdrawn between approval and setup completion. `reject` operates only on pending requests; manual Account Setup Link revocation is unimplemented. A fatal setup-link issuance failure can leave approval behind, allowing `/auth/renew-invite` to issue a credential even though the invitation did not complete. Reviewed-request provenance is visibility, not remediation.

F01 / task **11-01** owns coherent issuance, renewal and rescind transitions with concurrency-safe provenance. Preserve independent approvals, sibling Organization grants and existing accounts. Acceptance must cover fatal issuance failure, renewal, rejection/rescind, concurrent invitations and independent approvals with deterministic clocks and failure cases. Billing removal and this documentation consolidation do not close F01.

## Authorization decisions during remediation

[Authorization and provider boundaries](AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md) owns the current role, capability, shared-scope and sensitive-action model; ADRs 0001/0002 own its rationale. Resolve any consequential per-feature `operate`/`configure` or denied-access audit choice at the affected policy boundary before implementation. Existing lane independence is binding; an unresolved choice is not permission to borrow another lane. Follow the [decision boundaries](AI_AGENT_OPERATING_MODEL.md#decision-boundaries).

Resolved Critical Tasks, Dashboard Training-summary and Organization-settings narratives are retained in [committed history](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/architecture/DRIFT_LEDGER.md). The repaired Onboarding template/step policies retain their local security evidence in [EVIDENCE](../stabilization/EVIDENCE.md) and hosted owner-confirmation limits in [RELEASE](../stabilization/RELEASE.md#phase-05-d01-publication-prerequisites). Historical repair does not establish independently inspected production state.
