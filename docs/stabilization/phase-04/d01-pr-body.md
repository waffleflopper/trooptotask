D01 establishes the evidence needed to retire billing schema safely: a catalog-backed dependency inventory, real Supabase schema/type generation, and a populated synthetic upgrade baseline. It adds read-only owner preflight assertions and an ordered release/recovery plan for D02. No application behavior, active schema, applied migration or existing SQL test changes; no data is deleted.

The complete deliverable includes phase-04 activation and prior phase-03 acceptance reconciliation, 133-migration replay, exact RPC/table/column ownership, retained security/Calendar/shared-data boundaries, reproducible generation, and full-row baseline capture. D02 must retain its own fresh/upgrade checks and complete removal cutover; these pre-retirement results do not claim retirement or production readiness.

Validation: all seven canonical commands, including production build; 566 files / 5,181 retained tests; zero Svelte/type diagnostics. Isolated populated PostgreSQL checks pass: 20 suites / 399 assertions, accepted preflight and 15 rejected drift/dependency faults, unchanged complete catalog and all 69 row captures, 154 immutable input hashes preserved. Owned disposable resources were removed; 36 existing containers retain their identities/states. Markdown/links/whitespace and independent preparation/preflight review pass. Existing lint/build advisories remain recorded in `docs/stabilization/EVIDENCE.md`, task 04-01c-02.

Review focus: exact destructive identities/dependencies, PUBLIC-executable legacy ledger RPC exposure reserved for D02 removal, retained invitation/tenant/Calendar contracts, baseline reproducibility, preflight limitations, backup/restore and application compatibility. Do not use the generated schema snapshot as a migration. Keep historical baseline artifacts intact.

Vercel push/merge may deploy; external trigger settings are unverified. Repository CI is manual and no automatic remote migration is configured. This PR needs no migration, but the owner must verify deployment behavior before publication. Actual provider/caller shutdown, data disposition, backup/restore and production cleanup remain PENDING OWNER EXECUTION. No remote database or provider operations occurred.

Parent: #1277. Workflow: #1275. D02 #1310 remains blocked until this deliverable's verified merge and integrated-result verification.

Closes #1309
