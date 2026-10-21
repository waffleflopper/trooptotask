# Troop to Task

A military unit management platform for personnel tracking, calendar and availability, training records, counseling, onboarding and daily assignments. Built with SvelteKit 2, Svelte 5, TypeScript and Supabase, deployed on Vercel.

## Getting started

Prerequisites: Node.js 24 (`.nvmrc`), npm 11.12.1 and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm ci
supabase start
cp .env.example .env
supabase status -o env
npm run dev
```

Fill `.env` from the `supabase status` output and open <http://localhost:5173>.

This checkout's Supabase project is `trooptotask-v1-maintenance` on ports 56320–56329, so the API URL is `http://127.0.0.1:56321`. Port 54321 belongs to a frozen reference database; never point this app at it. `supabase/config.toml` disables the legacy seed, so use synthetic fixtures. On Robert's workstation, `trooptotask-local maintenance` (`check`, `db-start`, `status`, `app`) starts this stack and rejects any other project or port configuration.

## Checks

The [Definition of Done](docs/architecture/DEFINITION_OF_DONE.md#required-commands) lists the checks each kind of change needs. [CI](docs/ci.md) runs them on labeled pull requests.

## License

Proprietary software. All rights reserved.
