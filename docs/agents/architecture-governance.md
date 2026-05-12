# Architecture And Governance

Use this file before work that touches architecture, auth/authz, provider boundaries, terminology, cross-feature seams, or governance checks.

## Required Reading

- [V1 Architecture Contract](../architecture/ARCHITECTURE.md)
- [Authorization & Provider Boundaries](../architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md)
- [Feature & Module Conventions](../architecture/MODULE_CONVENTIONS.md)
- [Definition of Done](../architecture/DEFINITION_OF_DONE.md)
- [AI Agent Operating Model](../architecture/AI_AGENT_OPERATING_MODEL.md)
- [Drift Ledger](../architecture/DRIFT_LEDGER.md)
- [V1 Change Intent](../architecture/V1_CHANGE_INTENT.md)
- [ADR Backlog](../architecture/ADR_BACKLOG.md)
- [ADR Guidance](../architecture/ADR_GUIDANCE.md)
- [Governance Checks](../architecture/GOVERNANCE_CHECKS.md)
- [V1 Retrofit Skills Guide](../architecture/V1_RETROFIT_SKILLS_GUIDE.md)
- [Ubiquitous Language](../../UBIQUITOUS_LANGUAGE.md)

## Retrofit Guardrails

- Treat `Organization` and `Group` as canonical v1 domain terms.
- Do not back-port v2 `Account`, `Unit`, or `Element` terminology into v1 current-state docs or code unless the task is explicitly about migration mapping.
- Treat the current authorization system as tolerated current-state, not as the desired end-state.
- Do not add new business logic that depends directly on `locals.supabase` or other provider-specific clients outside auth, ports/adapters, or an explicitly approved remediation slice.
- Do not deepen feature-permission piggybacking. If a feature currently borrows another feature's permission lane, treat that as drift to reduce, not a pattern to copy.
- Treat `docs/architecture/GOVERNANCE_BASELINE.json` as the explicit allowlist for currently tolerated route-level provider leaks and cross-feature permission couplings.
- If a remediation slice removes tolerated drift, update the baseline and related drift docs in the same change.
- When legacy clinic-specific names appear, preserve compatibility but prefer the Army/military-oriented canonical term in docs, UX copy, and new code shapes.
- If an incidental task encounters authorization semantics, membership modeling, scope evaluation, provider-boundary leaks, or other cross-feature architecture seams, stop after documenting the issue unless the task explicitly authorizes remediation in that area.
