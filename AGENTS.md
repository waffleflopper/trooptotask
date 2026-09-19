# AGENTS.md

TroopToTask is a military unit management SaaS for personnel tracking, calendar/availability, training records, daily assignments, onboarding workflows, and unit management.

Use npm. Before completing work, follow the [verification contract](docs/architecture/DEFINITION_OF_DONE.md#required-commands), including the required checks and production build.

Never reset, migrate, delete tables from, delete entries in, or otherwise touch the remote production database. Do not reset or delete tables from the local development database without Robert's explicit permission.

## Working agreement

Carry the requested task through its acceptance criteria, affected consumers and verification. Use the current request and existing authorization to make routine implementation decisions; ask when an unresolved decision materially changes scope, product behavior or a protected boundary. User instructions take precedence over repository and skill guidelines, within system/developer constraints. See [operating rules](docs/agents/operating-rules.md) for scope, approval and completion decisions.

## Stabilization

For a stabilization task, read its entry in [TODO](docs/stabilization/TODO.md), relevant [baseline contracts](docs/stabilization/BASELINE.md#retained-contracts) and [evidence](docs/stabilization/EVIDENCE.md), and the [program decisions](docs/architecture/ARCHITECTURE.md#stabilization-decisions). For phase activation or the next-task driver, follow the [issue-aware checkpoints](docs/agents/operating-rules.md#stabilization-tasks). Complete one ready task within the active child and its full consumer cutover; stop at deliverable boundaries and respect phase dependencies. Billing, Duty Roster, E2E and unfinished migration paths must be removed by their owning tasks. Preserve Organization/Group scope, reviewed acquisition and retained contracts R1–R7. A separately requested docs or tooling task does not activate the next stabilization task.

## Task-specific guidance

Open the relevant sections when the task needs them; links are a reading map, not a mandatory reading sequence.

- Adding, rewriting, pruning or reviewing tests: [Testing strategy](docs/architecture/TESTING.md).
- Svelte/SvelteKit implementation or framework questions: [Svelte guidance](docs/agents/svelte.md).
- Components, route UI, shared styling or app shell: [UI system](docs/agents/ui-system.md).
- Architecture, authorization, provider boundaries or governance: [Architecture and governance](docs/agents/architecture-governance.md).
- Adding or moving feature code: [Feature organization](docs/agents/feature-organization.md).
- Reading or updating GitHub issues: [Issue tracker](docs/agents/issue-tracker.md); for labels, [Triage labels](docs/agents/triage-labels.md).
- Domain behavior or naming: [Domain docs](docs/agents/domain.md).
