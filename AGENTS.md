# AGENTS.md

TroopToTask is a military unit management SaaS for personnel tracking, calendar/availability, training records, daily assignments, onboarding workflows, and unit management.

Use npm. Follow the [verification contract](docs/architecture/DEFINITION_OF_DONE.md#required-commands) for the change: documentation checks for prose-only work; the full checks and production build for application changes.

After a focused repair, rerun the failed check and only adjacent checks justified by the changed behavior. Reuse passing evidence for unaffected paths. A full manual repeat is allowed only when indicated. Before starting it, state what invalidates the prior proof and why focused checks are insufficient. A new commit, review round or verification-session restart alone is not that justification. Follow the [rerun rule](docs/architecture/DEFINITION_OF_DONE.md#verification-after-a-fix); required current-head CI remains mandatory.

Never reset, migrate, delete tables from, delete entries in, or otherwise touch the remote production database. Do not reset or delete tables from the local development database without Robert's explicit permission.

## Working agreement

Robert likes ambitious ideas, simple systems, creative takes, and software that feels obvious. Understand the real constraint and choose the smallest model that makes correct behavior unsurprising. Inspect the nearest analogous implementation, reuse shared concepts, and keep scope focused. Existing complexity needs a reason to stay; new abstractions need a demonstrated use. Prefer clear types and narrow interfaces, with inference where it keeps code readable.

Make the app feel responsive. Consider request waterfalls, repeated work, data volume and feedback latency; use the [performance guidance](docs/architecture/ARCHITECTURE.md#performance) when changing those paths.

Carry authorized work through its acceptance criteria, affected consumers and verification. Resolve routine choices using these defaults and existing authorization. Ask when a missing decision materially changes product behavior, scope or a protected boundary. Current user instructions supersede repository and skill guidance within system/developer constraints. The database protections above and explicit security/release gates are firm boundaries. See [operating rules](docs/agents/operating-rules.md) for execution and communication.

Prefer cohesive deliverables that repair related defects together. Defects that share state handling, consumers and verification belong in one PR. Split only for an independent outcome, a release or migration dependency, or a review-size limit, and give the reason in the PR body.

## Task-specific guidance

When a project specifies its own verification toolkit or browser workflow in AGENTS.md or an invoked skill, follow that workflow. T3 browser preferences apply only when the project has not specified one.

For app verification, use the repository's `npm run verify:app` environment, native browser controls and documented verify-trooptotask helpers. Use an integrated browser only when Robert explicitly requests it. The communication app or harness does not change this default; tool availability or a failed call does not authorize switching browsers.

Open the relevant sections when the task needs them; links are a reading map, not a mandatory reading sequence.

The shared pstack plugin supplies general engineering methods. When using Poteto Mode in this repository, apply [t2t-engineer](.agents/skills/t2t-engineer/SKILL.md) alongside its chosen playbook. Follow the [skill integration rules](docs/agents/operating-rules.md#shared-skills-and-project-workflows); project contracts and local verification/PR skills govern TroopToTask work.

- Engineering investigation, feature work, bug fixes, refactoring, design or review: [t2t-engineer](.agents/skills/t2t-engineer/SKILL.md).
- Driving the real app, browser debugging or maintaining flow knowledge: [verify-trooptotask](.agents/skills/verify-trooptotask/SKILL.md). Use `npm run verify:app -- --help`; update affected feature recipes alongside behavior changes.
- PR feedback, current-candidate CI and authorized handoff: the repository's [finish-pr](.agents/skills/finish-pr/SKILL.md). Robert's "ship it" runs the global `ship-it` skill under finish-pr's gates.

- Adding, rewriting, pruning or reviewing tests: [Testing strategy](docs/architecture/TESTING.md).
- Svelte/SvelteKit implementation or framework questions: [Svelte guidance](docs/agents/svelte.md).
- Components, route UI, shared styling or app shell: [UI system](docs/agents/ui-system.md).
- Architecture, authorization, provider boundaries, governance, or adding and moving feature code: [Architecture and governance](docs/agents/architecture-governance.md).
- Reading or updating GitHub issues: [Issue tracker](docs/agents/issue-tracker.md); for labels, [Triage labels](docs/agents/triage-labels.md).
- Domain behavior or naming: [Domain docs](docs/agents/domain.md).

## Review guidelines

Reviewers, human or bot, flag these. Independent acceptance has repeatedly caught them after the review bots passed a PR.

- A state write or navigation after an `await` that does not check the user is still on the same Organization, dialog or request.
- An attribution column (completed by, archived by, saved by) that a client can set, or a SQL test that proves one as a superuser instead of an ordinary signed-in role.
- A region with no skeleton while it loads, layout shift when data arrives, or a failed source that breaks the page instead of showing its load error.
- A layout that breaks below 1024 px or at 390 px.
- A route or feature that restyles a shared component under `src/lib/components/patterns` instead of extending it.
- An audit or persistence write that is not awaited.
- A new or rewritten test that breaks [Testing strategy](docs/architecture/TESTING.md), such as one that still passes when the component renders nothing, or pins copy, mounted-row counts or the real clock.
- A threshold or color computed from a value the UI shows rounded.
- A URL-opened drawer or dialog that stays open after Back.

Treat style preferences as non-blocking.
