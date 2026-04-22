---
name: legacy-compat-rename
description: Applies canonical military terminology while preserving legacy runtime and schema compatibility in TroopToTask v1. Use when cleaning up clinic-era terms, tightening copy or docs, or introducing better abstractions without doing a mass rename or migration.
---

# Legacy Compat Rename

Use this when a v1 slice needs better language without pretending legacy storage names are already gone.

## Workflow

1. Inventory the term across:
   - schema and storage names
   - runtime code
   - docs
   - UX copy
2. Classify each use:
   - compatibility truth that must stay for now
   - docs/copy that should move now
   - abstraction names that can improve now
3. Prefer the forward-looking canonical term in:
   - docs
   - UX copy
   - new abstractions
4. Treat legacy names as compatibility labels, not canonical direction.
5. Update:
   - `UBIQUITOUS_LANGUAGE.md`
   - `docs/architecture/DRIFT_LEDGER.md`
   - `docs/architecture/V1_CHANGE_INTENT.md` when the migration intent changes

## Rules

- Do not do a mass rename unless the issue explicitly includes migration work.
- Do not hide unresolved naming contradictions.
- If a storage/runtime rename would require schema or migration changes, stop and open follow-up work.
- Pair with `ubiquitous-language` when canonical terminology changes.
