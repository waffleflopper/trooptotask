# Agent Operating Rules

Use this file for rules that affect most implementation tasks.

## Communication

- Robert has technical experience but is not overly technical. When using highly technical language, add a brief parenthetical explanation.

## Completion Checks

- Run `npm run format`, `npm run lint`, `npm run governance:check`, `npm run check`, and `npm run test` before considering implementation work complete.
- `npm run test` runs Vitest and is the required test command.

## Data Safety

- Do not reset, run migrations on, delete tables from, delete entries in, or otherwise touch the remote production database.
- Notify Robert when remote migrations need to be run before merging.
- Do not reset or delete tables from the local development database. If local reset or deletion appears necessary, ask Robert for permission first.
