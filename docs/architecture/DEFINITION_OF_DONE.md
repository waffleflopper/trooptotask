# Definition Of Done

This definition of done is for v1 work in this repo. It applies to both implementation slices and governance/documentation slices.

## Always Required

- The work reflects current v1 reality instead of inventing a cleaner architecture than the repo actually has.
- New docs clearly separate:
  - current-state truth
  - intended guardrails or direction
  - known drift or exceptions
  - deferred cleanup
- No unrelated or convenience-driven architectural drift was introduced.
- Required repo verification was run:
  - `npm run format`
  - `npm run lint`
  - `npm run governance:check`
  - `npm run check`
  - `npm run test`
- If any required verification cannot run, the blocker is explained explicitly.

## Required When Behavior Changes

- The closest sensible tests were added or updated when practical.
- The change does not create a new direct provider-boundary leak without an explicit reason.
- The change does not create a new cross-feature permission piggybacking pattern.
- Remote migration, hosted-config, or deployment follow-up is called out explicitly when relevant.

## Required When Architecture Or Authz Changes

- `docs/architecture/ARCHITECTURE.md` is updated if the default architectural path changed.
- `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md` is updated if authz or provider ownership changed.
- `docs/architecture/DRIFT_LEDGER.md` is updated if drift was reduced, introduced, or newly identified.
- `UBIQUITOUS_LANGUAGE.md` is updated if canonical terminology shifted.
- `docs/architecture/V1_CHANGE_INTENT.md` is updated if the slice changes the intended replacement direction for a known drift area.
- `docs/architecture/GOVERNANCE_BASELINE.json` is updated if the slice adds, removes, or reclassifies a tolerated provider-leak or permission-coupling exception.

## Required For Explicit Remediation Slices

- The system is less coupled or more explicit afterward than before.
- Any adjacent seams crossed by the slice are documented.
- The slice narrows drift; it does not simply move it.
- If the change implies a lasting architecture decision, update `docs/architecture/ADR_INDEX.md` for accepted decisions or `docs/architecture/ADR_BACKLOG.md` for open candidates.
- If the remediation establishes or changes a default rule, an ADR is added or queued using `docs/architecture/ADR_GUIDANCE.md`.

## Required For Docs-Only Slices

- The docs are specific to this repo and this codebase shape.
- Contradictions are named explicitly instead of being smoothed over.
- The docs do not present desired future state as if it were already implemented.
