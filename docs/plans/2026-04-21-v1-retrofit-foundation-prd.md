# PRD: V1 Retrofit Foundation

Date: 2026-04-21
Status: Draft
Type: Governance, documentation, and planning foundation

## Goals

- Establish a clear, repo-specific understanding of what v1 actually is today.
- Record the intended architectural and governance direction for v1 without pretending v1 should simply become v2.
- Create baseline docs and guardrails that help future AI and human contributors stop making the codebase worse.
- Identify the highest-risk drift areas in architecture, authz, provider ownership, module boundaries, terminology, and process.
- Produce a PRD that can later be sliced into explicit remediation issues.

## Non-Goals

- Rebuilding v1 into v2 during this pass.
- Large-scale product refactors or feature rewrites.
- Forcing a monorepo or package split that the repo does not currently use.
- Pretending contradictory v1 behavior is already reconciled.
- Removing legacy systems during a docs-only pass.

## Current-State Summary

### Product and repo shape

- TroopToTask v1 is a single SvelteKit application with one current deployable product surface.
- `Organization` is both the v1 tenancy boundary and the operational workspace boundary.
- `Group` is the current roster subdivision and scoped-access unit.
- The main product surface lives under `src/routes/org/[orgId]`.
- Frontend features are mostly organized under `src/features/*`, shared UI under `src/lib/components/*`, and shared server logic under `src/lib/server/*`.

### Architecture reality

- The backend already has a meaningful app-owned shape:
  - ports
  - adapters
  - use cases
  - entities
  - route wrappers
- That emerging architecture is the strongest architectural path in the codebase and should be treated as the default direction.
- The repo still contains route-local business logic and direct provider usage in important seams, so the architecture contract is only partially enforced.

### Auth and access reality

- Authentication is Supabase Auth with app-owned session, redirect, and MFA flow handling.
- Authorization is currently based on:
  - persisted membership roles `owner`, `admin`, `member`
  - boolean feature permissions
  - optional `scoped_group_id`
  - app-layer permission checks
  - SQL helper functions and RLS
- Admin UI presets such as `Full Editor`, `Team Leader`, and `Viewer` are convenience shapes over the current model, not persisted roles.

### Module and UI reality

- Route shells are thin in many places, especially where workspace bootstrap and feature views are already separated.
- Feature modules have a recognizable structure, but several high-value surfaces still contain large orchestration-heavy contexts, views, or route files.
- Shared UI and a serious component catalog already exist and provide a real design-system baseline.

### Testing and CI reality

- CI currently runs:
  - format check
  - lint
  - type check
  - unit tests
- The repo also has Playwright E2E coverage, but that is not part of the default GitHub Actions CI workflow.
- The test footprint is substantial across server use cases, routes, features, and E2E flows.
- There are no architecture fitness checks or repo templates enforcing the new governance direction yet.

### Process and doc reality

- Useful docs already exist for shared UI, security posture, local auth testing, and several feature PRDs.
- Stronger v2-style architecture and workflow docs were not yet established for v1 before this pass.
- No issue or PR templates were found under `.github/`.

## Intended-State Guardrails

- Keep `Organization` and `Group` as canonical v1 nouns until a deliberate migration changes them.
- Treat v1 current-state docs as current truth, not aspirational architecture fiction.
- Keep routes thin where practical.
- Keep business logic in app-owned feature modules and server use cases.
- Keep provider-specific persistence and integration details behind adapters and ports wherever feasible.
- Keep auth-provider-specific logic as the narrow exception, not the rule.
- Move v1 authorization toward app-owned roles, presets, grants or capabilities, scopes, and clearer policy decisions.
- Give each feature its own permission lane.
- Treat legacy clinic-era names as compatibility language, not canonical direction.
- Use explicit architecture-review slices for module deepening rather than opportunistic partial refactors.

## Drift Hotspots

### Authorization

- Boolean-heavy membership authz model is not the intended end-state.
- Feature permission lanes are still coupled in places, especially Critical Tasks and Rating Scheme adjacency.

### Provider ownership

- Route-level `locals.supabase` business logic remains in several high-risk seams:
  - dashboard invitation flows
  - organization creation
  - organization settings and member management
  - billing flows
  - admin/platform utilities
  - export flows
  - some layout settings fetches

### Module depth

- Calendar, dashboard, duty roster, personnel, training, and parts of onboarding contain orchestration-heavy modules that are difficult to reason about in one pass.

### Feature boundaries

- Critical Tasks is a distinct feature surface but not yet a distinct permission lane.
- Rating Scheme is active but still boundary-blurry with Leaders Book and personnel-adjacent surfaces.
- Leaders Book still exists conceptually while primary-nav visibility is reduced during redesign.

### Legacy language

- `clinicRole` and similar clinic-era terminology still appear in schema and code even though they no longer fit the intended Army-wide product language.

### Deprecated exceptions

- Demo and sandbox logic remain present and should not be treated as precedent.

## Architecture Concerns

- The strongest architecture in the repo is partially adopted rather than comprehensively enforced.
- Some important business seams still live in route files rather than use-case boundaries.
- Provider-specific logic still leaks outside adapter boundaries.
- Large orchestration modules create shallow-module friction and increase cognitive load.
- Some feature boundaries are operationally real in the UI but not yet real in the authorization model.

## Domain Language Concerns

- v1 must keep `Organization` and `Group` as canonical current-state terms.
- `Membership Role` and `Permission Preset` must stay distinct.
- `Duty Role` should become the canonical term over legacy `clinicRole`.
- `Critical Tasks`, `Training`, `Leader's Book`, and `Rating Scheme` need clear language that reflects feature reality without overstating current architectural cleanliness.

## UX And Process Concerns

- Hidden or transitional surfaces such as Leaders Book can create false certainty if docs imply either full removal or full stability.
- Current permission presets are user-friendly, but the underlying implementation is less intuitive and harder to audit.
- The repo lacks issue and PR templates that encode the new governance posture.
- Future AI agents need clearer reading order, stop conditions, and drift rules than the repo previously provided.

## Docs And Guardrails To Create Or Harden

### Created or hardened in this foundation pass

- `AGENTS.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
- `docs/architecture/MODULE_CONVENTIONS.md`
- `docs/architecture/DEFINITION_OF_DONE.md`
- `docs/architecture/AI_AGENT_OPERATING_MODEL.md`
- `docs/architecture/DRIFT_LEDGER.md`
- `docs/architecture/V1_CHANGE_INTENT.md`
- `docs/architecture/ADR_BACKLOG.md`
- `UBIQUITOUS_LANGUAGE.md`

### Still to consider after this pass

- issue templates for remediation slices
- PR template or review checklist tied to the definition of done
- architecture fitness checks
- terminology drift checks
- provider-leak allowlist checks

## CI And Enforcement Opportunities

- Add an architecture check that flags new route-level `locals.supabase` business logic outside an allowlist.
- Add a terminology check for v1 docs and prompts that accidentally back-port v2 nouns into current-state material.
- Add a guardrail check for new feature-permission piggybacking.
- Add repo templates that force slices to state:
  - current-state truth
  - intended direction
  - drift touched
  - docs updated
- Consider bringing a focused Playwright smoke layer into CI for high-risk auth and membership flows once the baseline architecture docs settle.

## ADR Backlog Recommendations

Highest-value ADRs to write as remediation starts:

1. v1 authorization replacement model
2. provider boundary contract
3. feature permission lane map
4. leaders-book and rating-scheme boundary
5. demo and sandbox decommissioning
6. legacy terminology compatibility policy

## Incremental Remediation Strategy

### Phase 1: Governance and discovery

- baseline docs and vocabulary
- drift ledger
- stop conditions for future AI work
- remediation PRD and slice guidance

### Phase 2: Authorization redesign planning

- design the replacement authz model
- define feature-lane ownership
- decide migration constraints and rollout strategy
- decide what auditability guarantees are required

### Phase 3: Provider-boundary hardening

- identify the highest-risk direct provider leak clusters
- move them behind app-owned use cases and adapters
- leave auth-provider-specific paths explicit and narrow

### Phase 4: Deep-module reviews

- use explicit architecture-review slices to deepen the highest-friction clusters
- prioritize surfaces where boundary cleanup unlocks multiple future slices

### Phase 5: Enforcement

- add CI checks and templates that reinforce the new rules

## Stop Conditions For Future AI Work

- Incidental tasks should not opportunistically modify authorization semantics, membership modeling, scope evaluation, provider-boundary seams, or canonical domain language.
- If an incidental task hits one of those seams, the default action is to document the issue and stop.
- Explicit remediation slices are allowed to cross adjacent seams when necessary, but they must:
  - reduce drift
  - update the relevant docs and ledgers
  - avoid creating a broader catch-22 elsewhere

## Deferred Ideas

- Large-scale repo reshaping into a package or monorepo model
- Full v2 terminology back-port into v1 current-state docs
- Full Leaders Book rebuild during a governance-only pass
- Comprehensive CI enforcement before the first remediation slices stabilize the target shape

## Suggested Slicing Guidance

When this PRD is later split into issues, prefer narrow vertical slices that:

- name the current-state truth first
- state exactly which drift entries they touch
- update docs as part of the slice
- avoid trying to solve authz, provider boundaries, and module deepening in one giant issue

Suggested initial slice order:

1. authorization replacement discovery and model design
2. feature permission lane map
3. highest-risk provider-leak cluster extraction
4. second provider-leak cluster extraction
5. first deep-module review
6. second deep-module review
7. CI and template enforcement
