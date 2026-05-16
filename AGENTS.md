# AGENTS.md

TroopToTask is a military unit management SaaS for personnel tracking, calendar/availability, training records, daily assignments, onboarding workflows, and unit management.

The repo uses npm. Before considering implementation work complete, run:

- `npm run format`
- `npm run lint`
- `npm run governance:check`
- `npm run check`
- `npm run test`

Never reset, migrate, delete tables from, delete entries in, or otherwise touch the remote production database. Do not reset or delete tables from the local development database without Robert's explicit permission.

For task-specific guidance, open only the files relevant to the work:

- [Agent operating rules](docs/agents/operating-rules.md)
- [Svelte and SvelteKit guidance](docs/agents/svelte.md)
- [UI system](docs/agents/ui-system.md)
- [Architecture and governance](docs/agents/architecture-governance.md)
- [Feature organization](docs/agents/feature-organization.md)
- [Issue tracker](docs/agents/issue-tracker.md)
- [Triage labels](docs/agents/triage-labels.md)
- [Domain docs](docs/agents/domain.md)
