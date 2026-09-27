# AGENTS.md

TroopToTask is a military unit management SaaS for personnel tracking, calendar/availability, training records, daily assignments, onboarding workflows, and unit management.

Use npm. Follow the [verification contract](docs/architecture/DEFINITION_OF_DONE.md#required-commands) for the change: documentation checks for prose-only work; the full checks and production build for application changes.

Never reset, migrate, delete tables from, delete entries in, or otherwise touch the remote production database. Do not reset or delete tables from the local development database without Robert's explicit permission.

## Working agreement

Robert likes ambitious ideas, simple systems, creative takes, and software that feels obvious. Understand the real constraint and choose the smallest model that makes correct behavior unsurprising. Inspect the nearest analogous implementation, reuse shared concepts, and keep scope focused. Existing complexity needs a reason to stay; new abstractions need a demonstrated use. Prefer clear types and narrow interfaces, with inference where it keeps code readable.

Make the app feel responsive. Consider request waterfalls, repeated work, data volume and feedback latency; use the [performance guidance](docs/architecture/MODULE_CONVENTIONS.md#performance) when changing those paths.

Carry authorized work through its acceptance criteria, affected consumers and verification. Resolve routine choices using these defaults and existing authorization. Ask when a missing decision materially changes product behavior, scope or a protected boundary. Current user instructions supersede repository and skill guidance within system/developer constraints. The database protections above and explicit security/release gates are firm boundaries. See [operating rules](docs/agents/operating-rules.md) for execution and communication.

## Current priority

The active work is stabilization and user-reported bug fixes: restore a maintainable, workable baseline by removing Billing and Duty Roster and repairing repository structure, architectural boundaries, and shared component usage. Billing and Duty Roster accumulated tightly coupled implementations and unnecessary compatibility layers. Remove them through their owning cleanup tasks while preserving the retained product and data contracts.

Defer new features, ground-up feature rebuilds (including a replacement Duty Roster), and infrastructure improvements outside the stabilization plan. Refactoring needed to complete an authorized cleanup or bug fix remains in scope. Older plans and tickets are backlog context, not authorization to resume deferred work. A current explicit request from Robert can change this priority without another confirmation.

Stabilization completion includes pruning documentation for features, code and systems whose removal is verified: delete obsolete plans and guides, and repair mixed documents and stale links. Keep documentation relevant to the retained project and required migration/security provenance. Revisit this temporary priority section when stabilization is complete.

For stabilization work, follow the [stabilization workflow](docs/agents/stabilization-workflow.md), which routes to the active task, retained contracts, program decisions and evidence. Its phase dependencies and deliverable checkpoints apply to that workflow. A separately requested docs or tooling task does not activate the queue.

## Task-specific guidance

Open the relevant sections when the task needs them; links are a reading map, not a mandatory reading sequence.

- Engineering investigation, fixed-issue work, design uncertainty, review or bounded parallel work: [t2t-engineer](.agents/skills/t2t-engineer/SKILL.md).
- Continuing a stabilization issue through its next verified PR, including coverage and review follow-through: [t2t-stabilize](.agents/skills/t2t-stabilize/SKILL.md).
- Driving the real app, browser debugging or maintaining flow knowledge: [t2t-verify](.agents/skills/t2t-verify/SKILL.md). Use `npm run verify:app -- --help`; update affected Feature Map entries and claims alongside behavior changes.

- Adding, rewriting, pruning or reviewing tests: [Testing strategy](docs/architecture/TESTING.md).
- Svelte/SvelteKit implementation or framework questions: [Svelte guidance](docs/agents/svelte.md).
- Components, route UI, shared styling or app shell: [UI system](docs/agents/ui-system.md).
- Architecture, authorization, provider boundaries or governance: [Architecture and governance](docs/agents/architecture-governance.md).
- Adding or moving feature code: [Feature organization](docs/agents/feature-organization.md).
- Reading or updating GitHub issues: [Issue tracker](docs/agents/issue-tracker.md); for labels, [Triage labels](docs/agents/triage-labels.md).
- Domain behavior or naming: [Domain docs](docs/agents/domain.md).
