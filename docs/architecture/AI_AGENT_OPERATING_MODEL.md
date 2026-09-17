# AI Agent Operating Model

Use this document when a task crosses module, authorization, provider or domain boundaries. General execution and approval rules live in [Agent Operating Rules](../agents/operating-rules.md); the [architecture reading map](../agents/architecture-governance.md) routes to task-specific references.

## Decision boundaries

A task's outcome defines its scope. A fix can require edits in adjacent modules without authorizing a wider redesign. Complete those necessary edits and their consumers while preserving the retained product and security contracts.

- For an incidental fix, follow the established architecture and preserve behavior outside the requested change. Record unrelated drift and continue; encountering a seam alone is not a stop condition.
- For authorized architecture or authorization remediation, finish the declared boundary and consumer cutover. Reduce coupling and retire superseded paths, using the [module conventions](MODULE_CONVENTIONS.md) and [stabilization decisions](ARCHITECTURE.md#stabilization-decisions).
- If the requested outcome depends on an unresolved product decision, a new privilege/tenancy rule or a material departure from an accepted ADR, identify the conflicting requirement and ask about that decision. Continue work that does not depend on the answer. Existing explicit authorization is sufficient; do not ask for it again.

These rules do not authorize unrelated redesigns, new governance exceptions or changes to [database protections](../../AGENTS.md). Keep Organization/Group scope, independent feature lanes and provider access within the [authorization contract](AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md).

## Current state and intended state

When code and documentation disagree, state the observed behavior and intended contract separately. Use the current user request, [program decisions](ARCHITECTURE.md#stabilization-decisions) and relevant accepted ADRs to resolve the difference where they establish intent. A contradictory implementation is not permission to preserve a defect or invent product behavior.

For genuinely open choices, present the smallest consequential decision with supporting evidence. Use an available design or domain skill when it helps; no named skill is a prerequisite for ordinary investigation or an otherwise authorized implementation.

## Documentation and verification

Update the affected source of truth when architecture defaults, authorization, provider ownership, terminology or drift status changes. [ADR guidance](ADR_GUIDANCE.md) determines when a lasting design decision needs an ADR; local fixes do not require a new architecture record.

Follow [Definition of Done](DEFINITION_OF_DONE.md) for checks and evidence. Reduce resolved entries in `GOVERNANCE_BASELINE.json` with their consumers and update the related ledger. An observed issue, a passing governance check or an incomplete migration is not a completed cutover.
