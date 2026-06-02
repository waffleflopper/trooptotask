# AI Agent Operating Model

This document tells AI contributors how to work safely in the v1 repo without improvising new hacks.

## Reading Order

Before significant work, read the following in this order when relevant:

1. `AGENTS.md`
2. `docs/architecture/ARCHITECTURE.md`
3. `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
4. `docs/architecture/MODULE_CONVENTIONS.md`
5. `docs/architecture/DRIFT_LEDGER.md`
6. `docs/architecture/GOVERNANCE_CHECKS.md`
7. `docs/architecture/V1_CHANGE_INTENT.md`
8. `UBIQUITOUS_LANGUAGE.md`
9. `docs/component-catalog.md` for UI work

## Working Modes

### Incidental task

An incidental task is a bug fix, polish task, docs tweak, or small feature change that is not explicitly authorized to remediate architecture or authz.

In this mode:

- do not opportunistically rewrite architectural seams
- do not deepen authz or provider-boundary drift
- do not infer desired product behavior from sloppy implementation alone
- document contradictions when they materially affect the task

### Approved remediation slice

An approved remediation slice is a task explicitly aimed at authorization, provider boundaries, module deepening, or another architecture concern.

In this mode:

- crossing adjacent seams is allowed when necessary
- the change should narrow drift, not spread it
- touched seams must be documented in the relevant architecture docs and ledgers

## Required Skill Usage

Use these workflows when applicable:

- `grill-me` when product, UX, architecture, or canonical language intent is unclear
- `improve-codebase-architecture` when the task is explicitly about deepening modules or tightening boundaries
- `tdd` when a behavior change should be driven through tests at the module seam
- `to-issues` when a broad remediation plan needs to become bounded implementation issues

When using `grill-me`, ask one question at a time.

## Hard Guardrails

- Treat `Organization` and `Group` as canonical v1 nouns.
- Do not back-port v2 `Account` / `Unit` / `Element` terminology into v1 current-state docs or code.
- Treat the current boolean-heavy authz implementation as tolerated current-state, not desired precedent.
- Do not add new direct `locals.supabase` business logic outside auth-provider edges, ports/adapters, or an explicitly approved remediation slice.
- Do not create new feature-permission piggybacking.
- Preserve compatibility with legacy clinic-era names, but prefer the Army/military-oriented canonical term in docs, product copy, and new abstractions.
- Treat `docs/architecture/GOVERNANCE_BASELINE.json` as the explicit record of currently tolerated route-level provider leaks and permission-lane exceptions.

## Stop-Work Rules

If a task is incidental and it runs into any of the following seams, stop after documenting the issue unless the task explicitly authorizes remediation:

- authorization semantics
- membership modeling
- scope evaluation
- provider-boundary leaks
- cross-feature architectural seams
- canonical domain-language changes

If the task is an explicit remediation slice in one of those areas, it may cross adjacent seams as needed, but it must:

- reduce coupling or ambiguity
- update the relevant docs and ledgers
- avoid creating a broader mess elsewhere

## Current-State Versus Intended-State Protocol

When the repo contains a contradiction:

1. Document what the code actually does today.
2. Document the intended direction separately.
3. Do not collapse the two into fake certainty.
4. If intent cannot be safely inferred, use `grill-me`.

## Documentation Update Rules

Update docs when work changes any of the following:

- architecture defaults
- auth/authz boundaries
- provider ownership
- canonical terminology
- known drift status
- stop conditions or operating guidance for future AI work

Run `npm run governance:check` whenever you touch route-level server code, authz, provider seams, or governance docs. If the baseline changes, update the relevant ledger or guidance in the same slice.

## Good Outcomes

- thinner interfaces over sprawling coordination
- better explanation of system boundaries
- fewer provider leaks
- clearer feature ownership
- clearer language
- fewer places where future AI has to guess
