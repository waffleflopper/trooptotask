---
name: v1-authz-design
description: Drives TroopToTask v1 authorization and boundary decisions into ADR-ready outputs without pretending v1 is already v2. Use when working authorization model, feature permission lane, scope, preset, or Rating Scheme/Leader's Book decision issues.
---

# V1 Authz Design

Use this for HITL retrofit issues that define v1 authz direction rather than implement it.

## Read first

- the GitHub issue
- `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
- `docs/architecture/DRIFT_LEDGER.md`
- `docs/architecture/V1_CHANGE_INTENT.md`
- `docs/architecture/ADR_BACKLOG.md`
- `UBIQUITOUS_LANGUAGE.md`

## Workflow

1. Summarize current-state truth from code and docs.
2. List what is ambiguous, contradictory, or obviously legacy drift.
3. Use `grill-me` to resolve unclear intent.
4. Ask one question at a time.
5. Keep `Organization` and `Group` as canonical v1 nouns unless the issue is explicitly about migration mapping.
6. Separate clearly:
   - current-state truth
   - intended direction
   - migration constraints
   - deferred cleanup
7. Produce ADR-ready output:
   - decision summary
   - rejected or deferred alternatives
   - rollout constraints
   - docs to update next

## Rules

- Do not infer desired behavior from sloppy implementation alone.
- Do not use v2 terminology as a shortcut for thinking.
- Do not slide from design work into runtime implementation unless the issue explicitly authorizes that step.
- Tighten vocabulary with `ubiquitous-language` when the decision changes canonical terms.
