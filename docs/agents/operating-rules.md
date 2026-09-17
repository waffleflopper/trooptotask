# Agent Operating Rules

Use this file for rules that affect most implementation tasks.

## Communication

- Robert has technical experience but is not overly technical. When using highly technical language, add a brief parenthetical explanation.

## Completion Checks

- Follow the [verification contract](../architecture/DEFINITION_OF_DONE.md#verification-contract) for the required command sequence, meaningful lower-level tests, computer-use flow evidence, isolated database checks and reproducible performance evidence. Run focused checks during work and the full sequence after final implementation changes.
- Record each required check as passed, failed or unavailable, with its command and evidence. A missing flow recording, failed test or unavailable tool is not a pass; keep its owning task open when that evidence is required for acceptance.

## Data Safety

- Do not reset, run migrations on, delete tables from, delete entries in, or otherwise touch the remote production database.
- Notify Robert when remote migrations need to be run before merging.
- Do not reset or delete tables from the local development database. If local reset or deletion appears necessary, ask Robert for permission first.

## Stabilization Tasks

- Apply the [program decisions](../architecture/ARCHITECTURE.md#stabilization-decisions) and select the first unchecked ready task in the active phase of [TODO](../stabilization/TODO.md). Read only its relevant baseline contracts and evidence. Existing task authorization covers the necessary consumer cutover; do not invent another approval step.
- If a task is too broad, record bounded children with prerequisites and measurable acceptance criteria, then complete only the first ready child. Do not activate a later phase automatically.
- Finish the declared cutover: implementation, affected consumers, meaningful tests, and deletion of replaced code, configuration and active guidance. Close only when acceptance evidence exists; update TODO and concise [EVIDENCE](../stabilization/EVIDENCE.md) together. Record newly discovered in-scope work in the queue before program closure.
- Preserve verification guards, scan paths and budgets. Do not add allowlists, skip tests or weaken assertions to pass checks. Record failures and unavailable checks explicitly.
- Do not create or run a repository E2E suite. Its removal is queued in phase 02. Production/remote actions, live data, deployment, publication and merge remain outside stabilization execution.
