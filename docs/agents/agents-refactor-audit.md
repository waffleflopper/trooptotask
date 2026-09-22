# AGENTS.md Refactor Audit

This file records the progressive-disclosure pass that split the root `AGENTS.md` into focused agent guides.

## Original refactor findings

No hard contradictions were found in the previous root `AGENTS.md`.

Potential ambiguity noted:

- The old reference-docs section said to read `docs/component-catalog.md` when modifying "UI components or server entities." The component catalog is UI-specific, so server/entity guidance now lives behind the architecture and domain docs instead.

## Original root AGENTS.md essentials

At that refactor, the root kept:

- One-sentence project description.
- Package manager and required non-standard commands.
- Database safety rule that applies to every task.
- Links to task-specific guide files.

## Historical docs/agents Structure

- `docs/agents/operating-rules.md`: communication, completion checks, data safety.
- `docs/agents/svelte.md`: Svelte MCP flow and shadcn-svelte documentation entrypoint.
- `docs/agents/ui-system.md`: current UI-system contract, route boundaries, shared-component authority.
- `docs/agents/architecture-governance.md`: task-scoped architecture reading list and current guardrails.
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

## September 16, 2026: Astra instruction audit

Reviewed the instruction chain from `AGENTS.md` and the `CLAUDE.md` redirect, all directly linked agent guides, and the architecture, completion, ADR and component-catalog instructions they disclose. This is a static instruction audit and revision, not a measured comparison of model performance. No repository-local skills or nested AGENTS were found; installed personal/plugin skills and model settings are outside this repo pass.

Sources: OpenAI's [Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) (September 11, 2026) and the Astra section of [Model guidance](https://developers.openai.com/api/docs/guides/latest-model), read September 16. Applied their guidance on task-specific routing, explicit completion boundaries, instruction conflicts and proportionate verification to this repo's existing contracts.

| Finding                                                                                                                                          | Revision                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root linked most guides without triggers and repeated the Svelte tool itinerary; its command list omitted parts of the completion contract.      | Root is a task router. Svelte has one workflow owner; Definition of Done owns the unchanged full command sequence.                                                                                                         |
| Architecture readers imposed broad ordered reading and mandatory obsolete `grill-me`, `improve-codebase-architecture` and `to-issues` workflows. | Route by the affected boundary; available skills support the work without becoming universal prerequisites. Replaced the multi-skill prompt template.                                                                      |
| Three guides stopped an incidental task merely for encountering an architecture/auth boundary.                                                   | Necessary adjacent work proceeds under existing authorization; unrelated discoveries are recorded. Ask only about a consequential unresolved dependency.                                                                   |
| UI guide/catalog required approval for every behavioral wrapper and ended component-fit work at a proposal.                                      | Authorized feature composition and shared API extensions include consumers and verification. Shared visual ownership, explicit visual-exception approval and the prohibition on duplicate/compatibility primitives remain. |
| Domain guides and ADR routing depended on an absent glossary.                                                                                    | Route to `CONTEXT.md#language`; ADR index resolves old glossary references without rewriting historical records.                                                                                                           |
| Issue guidance hardcoded a repository and treated any skill publication instruction as authority.                                                | Resolve the configured remote, distinguish reads from writes and honor only authorization that covers publication.                                                                                                         |
| Svelte guidance had no unavailable-tool path and prescribed repeated approval for standalone playgrounds.                                        | Use official docs/local checks when MCP is unavailable, report missing validation honestly and make playground links optional.                                                                                             |
| Repeated checks and duplicated approval rules could prolong or interrupt an otherwise complete task.                                             | One completion owner; rerun checks for changes, failures or unresolved concerns. Existing authorization persists, and any blocking rule must be cited with its concrete consequence.                                       |

Reviewed these scenarios against the revised chain:

- A prose correction follows its relevant references and documentation checks without loading every architecture or Svelte guide; the required completion commands remain intact.
- A session-admission fix reaches auth contracts and meaningful tests; needed caller edits do not trigger a blanket stop. A new unresolved privilege rule still requires a decision.
- An authorized UI behavior change can compose primitives or extend their shared API; a route-local visual exception still needs explicit approval if not already authorized.
- Schema verification follows the isolated synthetic stack contract; it never authorizes production access or resetting existing local data.
- A status question preserves unfinished work. An unrelated docs request does not advance the stabilization queue.
- Missing MCP capability is reported, with independent work continuing; an unavailable required acceptance check cannot be claimed passed.

Retained without relaxation: database/data safeguards, R1–R8, phase dependencies and one-task cutovers, complete consumer deletion, security and tenant isolation, no E2E execution, governance scans/budgets, meaningful testing policy and all seven completion commands. `feature-organization.md` and `triage-labels.md` already have narrow triggers and need no content change. Stabilization instructions, testing strategy, retained contracts and historical ADR decisions are preserved. Validation results are recorded in [stabilization evidence](../stabilization/EVIDENCE.md#astra-instruction-maintenance).

## September 21, 2026: Instruction and domain cleanup

Robert authorized this documentation revision after a read-only audit and comparison with his Battle Buddy `AGENTS.md`. Starting revision: `5f0cba7798aadc90d3246fcfc02f2cf09df20776`, clean working tree. This is separate from stabilization execution; no phase or task is activated.

The same [OpenAI article](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) and [model guidance](https://developers.openai.com/api/docs/guides/latest-model) were read for this audit. The revision applies task-specific disclosure, explicit completion boundaries and proportionate verification. The example contributes Robert's preferences for simple models, responsive workflows and consistent screens; its stack, typography limits and project-specific skill mandates are not TroopToTask defaults.

### Instruction ownership

- `AGENTS.md` keeps personal engineering judgment, project-wide protections and task routing. Performance details live in module conventions; complete-screen consistency and visual/composition policy live in the UI guide.
- Robert's follow-up makes stabilization and reported bug fixes the current priority. Billing/Duty Roster removal and structural/component repairs remain active; feature rebuilds and unrelated infrastructure plans stay deferred. Necessary cleanup refactoring remains authorized, and a current explicit user request can reprioritize work without a second confirmation.
- Completion includes retiring obsolete documentation after verified removals and revisiting the temporary priority statement itself. Mixed documents retain relevant contracts and required migration/security provenance; obsolete plans and guides are deletion work, not material to keep accumulating.
- The component catalog has a section index and component-specific recipes. Its blanket custom-variant ban and toolbar approval rule now defer to the UI policy. Existing tokens and production toolbar usage replace stale pre-migration descriptions.
- The stabilization checkpoint body moved unchanged into [its own workflow](stabilization-workflow.md). Active links point there; the old operating-rules heading remains a navigation pointer. Data protections, tracker authorization and release checkpoints remain in force.
- [Definition of Done](../architecture/DEFINITION_OF_DONE.md#required-commands) now separates documentation checks from application verification. This explicitly supersedes the September 16 choice to run all seven commands for documentation-only changes. The seven-command sequence and conditional database/browser evidence still apply to application changes; documentation maintenance cannot satisfy missing stabilization acceptance evidence.

### Domain content disposition

- [CONTEXT.md](../../CONTEXT.md#language) is a glossary of product terms and essential distinctions: 219 lines and 1,404 words, down from 678 lines and 9,196 words. It keeps the stable Language anchor and distinguishes identity, roster records, membership, governance, capability and scope.
- Authorization implementation and migration details defer to the architecture/authz contract and accepted ADRs; acquisition workflows defer to the launch acquisition guide and ADRs 0009/0012. Current access terminology replaces obsolete future-state descriptions.
- Code-module inventories, rendering/loading seams, repeated example dialogue and duplicated ambiguity notes were removed. Existing module conventions, roster read model and architecture documents own technical boundaries.
- Retired Duty Roster and Advanced Duty specifications defer to stabilization decisions and the superseded ADR. Their removal from the active glossary does not authorize deleting retained Calendar facts or other records.
- Unique retained product rules for training reports, readiness, Personnel links/files and Calendar imports live in [retained feature rules](../domain/retained-feature-rules.md), reached only for those behaviors. Their independent requirements are preserved separately from implementation and tests.

### Validation

Node `v24.18.0`, npm `11.17.0`; existing local tools, no dependency installation. Changes are limited to 13 Markdown files, including the new workflow and retained-feature reference.

| Check                                                                                                     | Result                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit Prettier `--write` and `--check` with `--ignore-path /dev/null` on the 13 changed Markdown files | Passed; exit 0.                                                                                                                               |
| Local Markdown link/heading scan starting at root and agent guides                                        | Passed; 61 reachable Markdown documents, 433 local links, no missing targets or unmatched anchors.                                            |
| `git diff --check`                                                                                        | Passed; exit 0.                                                                                                                               |
| `npm run governance:check`                                                                                | Passed; 14 required files, 15 route-provider and 17 admin-provider entries, zero permission couplings.                                        |
| Comparison with starting revision                                                                         | Root database rule, moved stabilization workflow body and seven-command application verification block preserved verbatim.                    |
| Independent instruction and domain reviews                                                                | Completed. One overbroad Training expiration statement was corrected: completion-based and expiration-date-only Training have distinct rules. |

Formatting paths: `AGENTS.md`, `CONTEXT.md`, `docs/agents/{agents-refactor-audit,domain,issue-tracker,operating-rules,stabilization-workflow,ui-system}.md`, `docs/architecture/{ARCHITECTURE,DEFINITION_OF_DONE,MODULE_CONVENTIONS}.md`, `docs/component-catalog.md`, `docs/domain/retained-feature-rules.md`.

Application tests, type checks, build, browser flows and database checks are not applicable to this documentation-only revision under the approved contract. No runtime behavior, dependency, database, test suite, stabilization status or deployment configuration changed. This is a static instruction/contract review, not measured evidence of improved model performance.
