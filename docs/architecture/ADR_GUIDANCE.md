# ADR Guidance

This repo now has enough architectural intent that some decisions should stop living only in PR descriptions, chat context, or drift notes.

Use an ADR when a slice changes or formalizes one of the repo's default rules.

## When To Write An ADR

Write or update an ADR when a slice:

- changes the default authorization model or permission-lane rules
- changes what counts as an allowed provider boundary
- changes canonical domain language
- changes the expected boundary between major feature surfaces
- changes a deprecation or containment strategy that other work will copy

Do not write an ADR for every cleanup task. If the work is local and does not set a reusable default, a drift-ledger update or issue note is usually enough.

## Where ADRs Live

- Future ADRs live under `docs/architecture/adrs/`
- Start from `docs/architecture/adrs/0000-template.md`
- Use zero-padded numbering such as `0001-v1-authorization-model.md`

## ADR Minimum Standard

Every ADR should include:

- the current-state truth
- the decision being made now
- rejected or deferred alternatives when they matter
- migration or rollout implications
- known exceptions or temporary tolerances
- links to the related issue, PRD, drift IDs, and affected docs

## Required Cross-Links

When an ADR lands, update the relevant supporting docs:

- `docs/architecture/ADR_INDEX.md`
- `docs/architecture/DRIFT_LEDGER.md` when drift status changes
- [CONTEXT.md language](../../CONTEXT.md#language) when canonical terms change

## Status Model

Use one of these statuses near the top of the ADR:

- `Proposed`
- `Accepted`
- `Superseded`
- `Rejected`

Keep accepted decisions while they govern current behavior. When a decision is superseded, link its replacement and exact committed historical version from the index, then remove the obsolete file if no current operational or migration requirement needs it. Preserve important rationale with the current decision; do not create placeholder documents to satisfy a checker.

## Open decision candidates

- **Clinic-era runtime/schema rename:** ADR 0006 governs present compatibility. A future rename needs an approved scope, migration sequencing, API/schema naming and import/export compatibility. This is deferred, not authorized by stabilization maintenance.
- **Future feature lanes:** a new durable product surface needs explicit permission ownership, invitation/member capability mapping and RLS implications. Existing lanes stay independent. No new feature implementation is authorized by listing this candidate.

Maintain a candidate here only while a consequential decision remains open. On acceptance, move its rationale to the relevant ADR and remove the candidate; ordinary migration tasks belong in TODO rather than a duplicate decision backlog.
