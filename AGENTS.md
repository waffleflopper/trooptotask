# AGENTS.md

TroopToTask is a military unit management SaaS for personnel tracking, calendar/availability, training records, daily assignments, onboarding workflows, and unit management.

The repo uses npm. Before considering implementation work complete, run:

- `npm run format`
- `npm run lint`
- `npm run governance:check`
- `npm run check`
- `npm run test`

Never reset, migrate, delete tables from, delete entries in, or otherwise touch the remote production database. Do not reset or delete tables from the local development database without Robert's explicit permission.

## Stabilization

For stabilization work, read the active task in [TODO](docs/stabilization/TODO.md), its relevant [baseline contracts](docs/stabilization/BASELINE.md#retained-contracts) and [evidence](docs/stabilization/EVIDENCE.md), and follow the [program decisions](docs/architecture/ARCHITECTURE.md#stabilization-decisions). Complete one ready task and its full consumer cutover; respect phase dependencies. Billing, Duty Roster, E2E and unfinished migration paths must be removed by their owning tasks. Preserve Organization/Group scope, reviewed acquisition and retained contracts R1–R7.

For task-specific guidance, open only the files relevant to the work:

- Adding, rewriting, pruning, or reviewing tests: read [Testing strategy](docs/architecture/TESTING.md).
- [Agent operating rules](docs/agents/operating-rules.md)
- [Svelte and SvelteKit guidance](docs/agents/svelte.md)
- [UI system](docs/agents/ui-system.md)
- [Architecture and governance](docs/agents/architecture-governance.md)
- [Feature organization](docs/agents/feature-organization.md)
- [Issue tracker](docs/agents/issue-tracker.md)
- [Triage labels](docs/agents/triage-labels.md)
- [Domain docs](docs/agents/domain.md)

When asked about Svelte or SvelteKit topics, use the Svelte MCP documentation flow:

1. Call `list-sections` first to discover relevant documentation sections.
2. Read the returned `use_cases` and call `get-documentation` for every relevant section.
3. When writing Svelte code, run `svelte-autofixer` and keep applying fixes until it reports no issues or suggestions.
4. Ask whether Robert wants a `playground-link` only when code was not written directly to project files.
