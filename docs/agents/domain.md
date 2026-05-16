# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a single-context repo.

- Domain context: `CONTEXT.md`
- ADR status and reading map: `docs/architecture/ADR_INDEX.md`
- ADR records: `docs/architecture/adrs/`
- Architecture governance docs: `docs/architecture/`
- Ubiquitous language: `UBIQUITOUS_LANGUAGE.md`

## Before exploring, read these

- Read `CONTEXT.md` before domain-heavy implementation, diagnosis, TDD, architecture cleanup, or issue slicing.
- Read `docs/architecture/ADR_INDEX.md` before opening individual ADRs. Then read only the ADRs relevant to the touched architecture, auth/authz, provider-boundary, terminology, or cross-feature seam.
- Read `UBIQUITOUS_LANGUAGE.md` when naming domain concepts in code, docs, issue titles, test names, or UX copy.
- Read `docs/architecture/` governance docs when the work may affect module boundaries, permissions, provider seams, drift remediation, or definition of done.

If a listed file does not exist in a future branch, proceed silently instead of blocking.

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md` and `UBIQUITOUS_LANGUAGE.md`. Do not drift to synonyms the docs explicitly avoid.

If the concept is missing from the glossary, note it as a documentation gap instead of inventing a new project term casually.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface that conflict explicitly before implementing.
