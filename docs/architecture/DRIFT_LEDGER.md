# V1 Drift Ledger

This is the current register of unresolved architectural gaps. The [ownership inventory](CURRENT_OWNERSHIP.md) identifies concrete migration packets; [TODO](../stabilization/TODO.md) owns execution order. Recording debt does not authorize new exceptions or establish acceptance. Remove resolved narratives after preserving concise acceptance evidence and a committed reference under the [evidence contract](DEFINITION_OF_DONE.md#recording-evidence).

## D-02 Provider-Boundary Leaks

The route baseline retains 5 `locals.supabase` auth edges and 17 admin/provider wiring entries. These classifications do not make all current wiring the target architecture. [Governance checks](GOVERNANCE_CHECKS.md) describe their exact enforcement and limits; the Phase 08 inventory also owns remaining cross-module and provider leaks. Current Supabase Auth, SQL/RLS, Storage and transaction guarantees remain supported infrastructure.

D01 moves request session/logout, actor admission, login, verified confirmation-flow marking, MFA challenge/management, profile/current email, account email/proof, sensitive-action, cookie and durable password-update/completion operations into Identity. Delivery uses its admitted actor and narrow public operations; replaced central helpers, browser/component paths, raw-token session exchange, Locals wrappers and resolved route exceptions are deleted. OTP sessions require a signed pending or completed marker for application admission; a missing marker discards their local session except during verified global logout. The hook retains request-local client construction, HTTP mapping and independent Organization admission. `App.Locals` is SvelteKit delivery state; no dependency exception was added. The existing durable limiter is consumed through Access’s public server seam. Acquisition/recovery orchestration remains D02; broader contexts retain their explicit [TODO](../stabilization/TODO.md#d01-bounded-tasks--identity-admission-and-account-security) owners.

Move business policy outside owned auth/provider adapters behind narrow feature operations, following [ADR 0004](adrs/0004-v1-provider-boundary-contract.md) and [ADR 0013](adrs/0013-v1-module-and-delivery-contract.md). Complete each consumer cutover before removing its baseline entry. Do not add exceptions or reclassify remaining violations to pass governance.

## D-05 Legacy Clinic Vocabulary

`clinicRole` / `clinic_role` remain retained Personnel fields. Their canonical user-facing term is **Duty Role**; some surfaces still use clinic-era or ambiguous `Role` labels. Preserve existing data, runtime/API shapes and tolerated legacy import labels while using canonical copy in new work. [ADR 0006](adrs/0006-legacy-terminology-compatibility-policy.md) owns this compatibility rule.

A repo-wide runtime/schema rename remains an explicitly approved future decision, including migration sequencing and import/export compatibility; documentation cleanup does not authorize it.

## D-07 Large Orchestration Modules

Calendar, Dashboard, Personnel and Training still have coordination-heavy modules and unfinished ownership/import cutovers. [CURRENT_OWNERSHIP](CURRENT_OWNERSHIP.md) records the actual source graph and packet owners; [module conventions](MODULE_CONVENTIONS.md) and ADR 0013 define the chosen public, portable, web and server seams. Phase 07 establishes and pilots these boundaries; Phase 08 completes the remaining consumers. Existing read-model, range-coordinator and shared domain seams are useful foundations, not proof that the full graph complies.

Deepen only the authorized boundary, preserve retained behavior and remove replaced central paths and compatibility facades with their callers. A passing regression check still reports existing Phase 08 debt.

The Personnel leader-note DTO and create-input validation have one consumed portable definition in `src/features/personnel/contracts.ts`. Its page, JSON and archived-artifact operations now use typed request-local collaborators through `src/features/personnel/index.server.ts`; the replaced central note operation is gone. Organization owns the member-label read for notes. The shared artifact helper remains for counseling, documents and follow-ups. The list operation now uses bounded timestamp/ID cursor reads and label batches through the same scoped adapter. Parent archive/restore now composes the owned note effect through typed persistence, preserving the existing caller policy and effect order; the old note lifecycle registration and unused mapper export are removed. Export and retention now consume Personnel-owned note source operations through typed persistence, with existing request/cron authority bound in delivery. The foreign generic note reads/deletion and two obsolete extended-info property reads are removed; legacy blank fields remain. The unused central archived-artifact mutation dispatchers and their types/maps are removed; the archived page uses the live per-kind JSON endpoints. D03's isolated SQL/RLS, real admission and browser lifecycle proof is accepted in the [current evidence](../stabilization/EVIDENCE.md#phase-07-integrated-phase-check); the completed pilot is merged through [PR #1345](https://github.com/waffleflopper/trooptotask/pull/1345). The generic request context remains for other operations. The broader Personnel migration remains Phase 08 work; Phase 07 technical acceptance and its conditional closeout protocol are recorded in the linked evidence.

## D-09 Automatic CI validation

The separately authorized [Depot CI migration](../ci.md) replaces the former manual-only GitHub validation workflow with PR/main triggers, conservative change selection, full application checks and isolated database contracts. Its current verification/activation status is recorded there; configured triggers alone do not establish a successful hosted run. F03's automation repair is owned by that change, while task **11-04** retains the separate local CSP issue.

Robert explicitly accepts an unprotected private `main` on the existing GitHub plan, with owner review of CI results before merge. Paid branch protection and rulesets are not requirements, defects or reasons for a red check. Existing source/governance, security and test controls remain required; failed validation still blocks acceptance. The module checker supplements the route/provider/permission controls and does not certify every unfinished Phase 08 boundary.

## D-10 No Rescind Lever For Auto-Approved Platform Access

An Access Request auto-approved from an Organization Invitation (ADR 0012) cannot have platform access withdrawn between approval and setup completion. `reject` operates only on pending requests; manual Account Setup Link revocation is unimplemented. A fatal setup-link issuance failure can leave approval behind, allowing `/auth/renew-invite` to issue a credential even though the invitation did not complete. Reviewed-request provenance is visibility, not remediation.

F01 / task **11-01** owns coherent issuance, renewal and rescind transitions with concurrency-safe provenance. Preserve independent approvals, sibling Organization grants and existing accounts. Acceptance must cover fatal issuance failure, renewal, rejection/rescind, concurrent invitations and independent approvals with deterministic clocks and failure cases. Billing removal and this documentation consolidation do not close F01.

## Authorization decisions during remediation

[Authorization and provider boundaries](AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md) owns the current role, capability, shared-scope and sensitive-action model; ADRs 0001/0002 own its rationale. Resolve any consequential per-feature `operate`/`configure` or denied-access audit choice at the affected policy boundary before implementation. Existing lane independence is binding; an unresolved choice is not permission to borrow another lane. Follow the [decision boundaries](AI_AGENT_OPERATING_MODEL.md#decision-boundaries).

Resolved Critical Tasks, Dashboard Training-summary and Organization-settings narratives are retained in [committed history](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/architecture/DRIFT_LEDGER.md). The repaired Onboarding template/step policies retain their local security evidence in [EVIDENCE](../stabilization/EVIDENCE.md) and hosted owner-confirmation limits in [RELEASE](../stabilization/RELEASE.md#phase-05-d01-publication-prerequisites). Historical repair does not establish independently inspected production state.
