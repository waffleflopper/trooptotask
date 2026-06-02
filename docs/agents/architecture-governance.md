# Architecture And Governance

Use this file before work that touches architecture, auth/authz, provider boundaries, terminology, cross-feature seams, or governance checks.

## Current-State Reading

Read only the docs that match the task. Do not front-load every historical architecture note into ordinary feature or improvement work.

For most architecture or improvement scans, start with:

- [V1 Architecture Contract](../architecture/ARCHITECTURE.md)
- [Feature & Module Conventions](../architecture/MODULE_CONVENTIONS.md)
- [Drift Ledger](../architecture/DRIFT_LEDGER.md)
- [Governance Checks](../architecture/GOVERNANCE_CHECKS.md)
- [ADR Index](../architecture/ADR_INDEX.md)
- [Ubiquitous Language](../../UBIQUITOUS_LANGUAGE.md)

For auth, authorization, provider-boundary, or membership work, also read:

- [Authorization & Provider Boundaries](../architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md)
- [V1 Change Intent](../architecture/V1_CHANGE_INTENT.md)
- relevant ADRs from [ADR Index](../architecture/ADR_INDEX.md)

For ADR work, also read:

- [ADR Guidance](../architecture/ADR_GUIDANCE.md)
- [ADR Backlog](../architecture/ADR_BACKLOG.md)
- [ADR Template](../architecture/adrs/0000-template.md)

For done criteria or workflow governance, also read:

- [Definition of Done](../architecture/DEFINITION_OF_DONE.md)
- [AI Agent Operating Model](../architecture/AI_AGENT_OPERATING_MODEL.md)

## Current Guardrails

- Treat `Organization` and `Group` as canonical v1 domain terms.
- Do not back-port v2 `Account`, `Unit`, or `Element` terminology into v1 current-state docs or code unless the task is explicitly about migration mapping.
- Treat the current authorization system as tolerated current-state, not as the desired end-state.
- Do not add new business logic that depends directly on `locals.supabase` or other provider-specific clients outside auth, ports/adapters, or an explicitly approved remediation slice.
- Do not deepen feature-permission piggybacking. If a feature currently borrows another feature's permission lane, treat that as drift to reduce, not a pattern to copy.
- Treat `docs/architecture/GOVERNANCE_BASELINE.json` as the explicit allowlist for currently tolerated route-level provider leaks and cross-feature permission couplings.
- If a remediation slice removes tolerated drift, update the baseline and related drift docs in the same change.
- When legacy clinic-specific names appear, preserve compatibility but prefer the Army/military-oriented canonical term in docs, UX copy, and new code shapes.
- If an incidental task encounters authorization semantics, membership modeling, scope evaluation, provider-boundary leaks, or other cross-feature architecture seams, stop after documenting the issue unless the task explicitly authorizes remediation in that area.
