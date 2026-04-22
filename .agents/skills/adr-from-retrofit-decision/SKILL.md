---
name: adr-from-retrofit-decision
description: Turns an approved TroopToTask v1 retrofit decision into an ADR with current-state truth, decision, exceptions, and rollout notes. Use when a HITL retrofit issue has been resolved and the outcome should be captured under `docs/architecture/adrs/`.
---

# ADR From Retrofit Decision

Use this after a retrofit decision is settled and needs to be preserved as a durable architecture record.

## Read first

- the resolved issue or decision summary
- `docs/architecture/ADR_GUIDANCE.md`
- `docs/architecture/adrs/0000-template.md`
- the touched architecture docs
- `docs/architecture/DRIFT_LEDGER.md`
- `docs/architecture/V1_CHANGE_INTENT.md`

## Workflow

1. Capture the current-state truth that existed before the decision.
2. Write the decision clearly and in repo-specific language.
3. Record relevant alternatives and why they were rejected or deferred.
4. Name temporary tolerances and exceptions honestly.
5. Record rollout implications and follow-up slices.
6. Create the ADR file under `docs/architecture/adrs/`.
7. Update:
   - `docs/architecture/ADR_BACKLOG.md`
   - `docs/architecture/DRIFT_LEDGER.md` when drift status changed
   - `docs/architecture/V1_CHANGE_INTENT.md` when intent changed
   - `UBIQUITOUS_LANGUAGE.md` when canonical terms changed

## Rules

- Do not rewrite history to make the old state look cleaner than it was.
- Do not delete superseded ADRs; mark them and link forward.
- Do not skip migration constraints or temporary exceptions.
