---
name: retrofit-slice-audit
description: Audits a TroopToTask v1 retrofit slice for drift integrity, doc updates, baseline accuracy, and required verification. Use before closing a retrofit issue or PR, especially after authz, provider-boundary, terminology, or module-boundary work.
---

# Retrofit Slice Audit

Use this as the final pass before declaring a v1 retrofit slice complete.

## Audit checklist

1. Compare the diff against the issue scope.
2. Confirm the work still reflects current-state truth rather than wishful architecture.
3. Confirm touched drift is documented honestly:
   - reduced
   - unchanged but clarified
   - newly introduced
4. Confirm docs were updated where needed:
   - drift ledger
   - change-intent
   - ubiquitous language
   - governance baseline
   - ADR backlog or ADR file
5. Confirm no new undocumented:
   - route-level `locals.supabase` leaks
   - feature-lane piggybacking
   - clinic-era canonical language
6. Confirm required verification ran:
   - `npm run format`
   - `npm run lint`
   - `npm run governance:check`
   - `npm run check`
   - `npm run test`

## Output

Report findings first:

- scope drift
- missing doc updates
- stale baseline entries
- hidden behavior changes
- test or verification gaps

If no findings remain, say that explicitly and note any residual risk that was intentionally deferred.
