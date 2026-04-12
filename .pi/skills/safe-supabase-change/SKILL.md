---
name: safe-supabase-change
description: Safely changes Troop to Task server entities, adapters, and Supabase-related behavior without violating project guardrails. Use when touching `src/lib/server/**`, Supabase flows, SQL, migrations, or persistence behavior.
---

# Safe Supabase Change

## Read first

Before making changes, read:

- `../../../AGENTS.md`
- The relevant files under `../../../src/lib/server/entities/`
- The relevant files under `../../../src/lib/server/adapters/`
- Nearby tests that cover the affected persistence behavior

## Non-negotiable guardrails

- Do **not** reset, migrate, or delete the remote production database
- Do **not** reset or delete the local development database without explicit user permission
- If a migration must be run remotely before merge, do **not** run it from pi; clearly note the required manual step instead
- Avoid destructive SQL and direct data deletion unless the user explicitly approves it

## Workflow

1. Inspect the relevant entity definition, adapter/port implementation, and tests together.
2. Understand whether the change is schema-level, query-level, auth-policy-level, or serialization-level.
3. Make the smallest safe code change first.
4. If a migration file is required, keep the code change and the migration impact clearly separated in your summary.
5. Add or update tests close to the changed server behavior.
6. Call out any manual Supabase or deployment follow-up that pi must not execute.
7. Before finishing, run:
   - `npm run format`
   - `npm run lint`
   - `npm run check`
   - `npm run test`

## Special attention areas

- Row-level security assumptions
- Permission and membership context
- Serialization/deserialization mismatches
- Backward compatibility with existing entity data
- Edge cases around missing org/user context

## Final response checklist

Include:

- Server files changed
- Tests added or updated
- Whether a migration or remote step is required
- Explicit note that remote migration/application must be run manually, if applicable
