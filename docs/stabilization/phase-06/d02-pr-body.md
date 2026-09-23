# PR title

[V1 stabilization][06][D02] Retire Duty schema while preserving Calendar

# PR body

Parent: #1279

Closes #1329

## Scope

- Add one transactional forward migration for a pre-retirement guard, retained rank/Calendar/status detachment and explicit restrictive retirement of all 14 Duty-owned tables and five Duty-only RPCs. Preserve saved Calendar assignments, types, availability, status, Personnel Duty Role, independent Sign-In Rosters and tenant/Group RLS.
- Remove remaining SQL cases and application assertions that query retired Duty template storage. Keep retained Calendar, rank, archive and authorization tests.
- Archive the generated target schema, TypeScript types and full effective catalog from matching isolated fresh and populated-upgrade targets. Update the Phase 06 queue, evidence, owner preflight and release sequence.

## Verification

- Fresh 138-migration replay and populated 137-to-138 upgrade: 22 SQL suites / 471 assertions each; D01 before oracle 35/35; final after oracle 33/33; retained Calendar SQL 34/34. Cross-Organization mismatch and a late dependent-view failure both roll back the entire migration and its ledger entry. Protected Calendar, status, availability, type and Sign-In fields remain byte-identical across the valid upgrade.
- Fresh and upgrade generated types, SQL schema dump and complete catalog match. The target catalog has no active Duty/DA6 object or function body. Generated types pass ESLint and strict TypeScript compilation.
- `npm run format`, `format:check`, `lint`, `governance:check`, `check`, `test` and `build` pass. Vitest: 544 files / 4,880 tests. Published review findings on partial cutover and retired-storage coverage were repaired; final independent local review found no concrete remaining defect. See [final repair evidence](https://github.com/waffleflopper/trooptotask/blob/stabilization/06-d02-schema-retirement/docs/stabilization/EVIDENCE.md#pr-1333-review-repair--atomic-d02-cutover).

## Review and release boundary

Review the destructive SQL against the D01 catalog and the privately captured hosted schema/data, the Calendar/Group/RLS preservation oracle, the generated target archive and the full branch diff. The local proof does not establish hosted parity. Before a releasing merge, the owner must verify the deployed no-Duty app and drained old instances, workers and callers; arrange notice and a tested backup/restore point; review hosted provenance and migration ledger; and confirm the controlled write window, app/schema compatibility and rollback plan. An old Duty-dependent binary is unsafe after the destructive commit. The owner must use the verified transactional Supabase CLI migration path or prove an equivalent runner; statement-by-statement execution loses rollback protection. No remote migration is automated by repository configuration or authorized by this PR body.

**Base:** `main` at fetched `ba79762a50daf4511b99e4941bbf17b0ff3eeb7b`. **Head branch:** `stabilization/06-d02-schema-retirement`, containing the complete D02 cutover and review repairs. `vercel.json` declares production builds and crons; a push may create a preview and a merge may deploy through external Vercel settings that remain unverified. Repository CI is manual-only; no automatic remote migration workflow was found.
