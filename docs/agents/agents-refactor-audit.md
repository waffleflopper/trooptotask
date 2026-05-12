# AGENTS.md Refactor Audit

This file records the progressive-disclosure pass that split the root `AGENTS.md` into focused agent guides.

## Contradictions

No hard contradictions were found in the previous root `AGENTS.md`.

Potential ambiguity noted:

- The old reference-docs section said to read `docs/component-catalog.md` when modifying "UI components or server entities." The component catalog is UI-specific, so server/entity guidance now lives behind the architecture and domain docs instead.

## Root AGENTS.md Essentials

The root file now keeps only:

- One-sentence project description.
- Package manager and required non-standard commands.
- Database safety rule that applies to every task.
- Links to task-specific guide files.

## Suggested docs/agents Structure

- `docs/agents/operating-rules.md`: communication, completion checks, data safety, demo/sandbox deprecation.
- `docs/agents/svelte.md`: Svelte MCP flow and shadcn-svelte documentation entrypoint.
- `docs/agents/ui-migration.md`: design-system migration contract, route boundaries, shared-component authority.
- `docs/agents/architecture-governance.md`: architecture reading list and retrofit guardrails.
- `docs/agents/feature-organization.md`: path aliases and feature module conventions.
- `docs/agents/issue-tracker.md`: GitHub issue tracker operations.
- `docs/agents/triage-labels.md`: issue triage label mapping.
- `docs/agents/domain.md`: domain documentation entrypoints.

## Flagged For Deletion

These instructions were not carried forward verbatim:

- "This codebase will outlive you..." and "Fight entropy." Reason: valuable tone, but too vague to be directly actionable.
- "Performance first", "Reliability first", "Choose correctness and robustness over short-term convenience", "Adhering to best practices and industry standards", and "Maximizing user experience." Reason: broadly true but too general to guide a specific agent decision without concrete acceptance criteria.
- Repeated issue tracker, triage, and domain-doc summaries in the root file. Reason: redundant with the dedicated `docs/agents/*.md` files.
- The standalone horizontal rules from the previous file. Reason: formatting only.
