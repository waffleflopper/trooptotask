# Troop to Task

A military unit management platform for personnel tracking, calendar/availability, training records, counseling, onboarding, and daily assignments. Built with SvelteKit and Supabase.

## Features

### Dashboard

- Organization overview with key metrics at a glance
- Focused readiness, people/duty, and training/evaluation views
- Quick access to all features

### Calendar & Availability

- Visual monthly calendar showing all personnel availability
- Color-coded, customizable status types (Leave, TDY, School, Sick, etc.)
- Daily assignment planning (MOD, Front Desk, CQ, etc.)
- Monthly assignment planner with quick-fill options
- 3-month long-range planning view
- Today's breakdown with real-time coverage gaps
- Bulk status application and removal
- Status notes for additional context
- Weekend and federal holiday management

### Personnel Management

- Organize personnel by groups and sections
- Track rank, MOS, contact info, and extended personnel data
- Bulk import via CSV or Excel
- Personnel archival system with configurable retention
- Group-scoped access for team leaders

### Training & Certifications

- Customizable training types with expiration tracking
- Multi-threshold warnings (60 days, 30 days, expired)
- Training matrix showing all personnel x training types
- Bulk import training records via CSV or Excel
- Delinquency reports sorted by urgency
- Rating schemes for performance tracking

### Onboarding

- Template-based onboarding workflows
- Track new personnel through customizable checklists
- Visual progress indicators

### Personnel Detail, Counseling & Follow-Ups

- Personnel-owned counseling PDF storage
- Soldier Data Sheet details and leader notes
- Follow-ups for counseling reminders, action items, and development tracking
- General Personnel document uploads

### Duty Roster & Sign-In Rosters

- Automated duty roster generation
- Printable sign-in roster generation

### Administration

- Role-based permissions (Owner, Admin, Member) with 11 granular permission flags
- Group-scoped access control for team leaders
- Deletion approval workflow for non-privileged users
- Personnel archival with admin review
- Audit logging for compliance
- Notification system (bell icon with real-time unread count)

### Platform

- Light and dark mode
- Mobile responsive with bottom tab navigation
- Multi-organization support
- Subscription tiers (Free, Team, Unit) with personnel-count gating
- What's New changelog for users
- Feedback submission system

## Tech Stack

- **Framework**: SvelteKit 2 + Svelte 5 (runes)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL + Row Level Security)
- **Authentication**: Supabase Auth
- **Styling**: Pure CSS with custom properties (no Tailwind)
- **Payments**: Stripe (subscription billing)
- **Deployment**: Vercel
- **Testing**: Vitest (unit) + Playwright (E2E)

## Getting Started

This maintenance checkout uses its own 563xx Supabase stack and browser-test port 4273.
See [Local maintenance environment](docs/local-maintenance-environment.md) before
following the generic setup instructions below.

### Prerequisites

- Node.js 24.x (use `.nvmrc` with `nvm use` if you use nvm)
- npm 11.12.1 (upgrade npm to 11.12.1 if your Node install ships a different version)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/waffleflopper/trooptotask.git
   cd trooptotask
   ```

2. Install dependencies:

   ```bash
   npm ci
   ```

3. Start the local Supabase instance:

   ```bash
   supabase start
   ```

4. Create a `.env` file from the template, then fill in your local Supabase credentials:

   ```bash
   cp .env.example .env
   supabase status -o env
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:5173](http://localhost:5173)

### Local Auth Testing

- Local Supabase auth emails are captured at [http://127.0.0.1:54324](http://127.0.0.1:54324) via Mailpit.
- Use `supabase status -o env` to copy the current local keys into `.env.local` if needed.
- Run `npm run test:e2e:auth` for invite/password-reset coverage and `npm run test:e2e:access-requests` for access-request approval coverage.
- The Playwright auth suites boot their own isolated app server on `127.0.0.1:4173`, so you can keep your normal dev server running on `localhost:5173` while the tests execute.
- See [docs/local-auth-testing.md](docs/local-auth-testing.md) for the full workflow.

### Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run check        # TypeScript/Svelte type checking
npm run gate         # Run format check, lint, governance, check, and tests
npm run lint         # ESLint
npm run format       # Prettier formatting
npm run test         # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright)
```

### Verification Gate

Run `npm run gate` before shipping changes; it runs the five required local checks in order:
format check, lint, governance, Svelte/TypeScript check, and unit tests. Dependency setup also
configures `.githooks/pre-push` so pushes run the same gate automatically. To opt out of the
local hook wiring, run `git config --unset core.hooksPath`.

## Project Structure

```
src/
  app.css                    # Global design system + CSS variables
  features/
    training/                # Training types, matrix, reports, bulk import
    personnel/               # Personnel CRUD, bulk import, extended info
    calendar/                # Calendar views, availability, status, assignments
    onboarding/              # Onboarding workflows, templates
    dashboard/               # Readiness, people/duty, and training/evaluation overview
    duty-roster/             # Duty roster generation
    sign-in-rosters/         # Sign-in roster generation
    groups/                  # Group and member management
  lib/
    components/              # Shared layout components (Modal, PageToolbar, etc.)
    components/ui/           # Shared UI primitives (Badge, Spinner, DataTable, etc.)
    server/
      entities/              # Schema-first entity definitions
      apiRoute.ts            # API route wrapper (permissions, validation, audit)
    stores/                  # Shared cross-cutting stores
    types.ts                 # Shared TypeScript types
    utils/                   # Shared utilities
  routes/
    org/[orgId]/             # Main app (thin shells importing from features)
    auth/                    # Login, callback, registration
    billing/                 # Subscription management
```

Each feature module contains its own `components/`, `stores/`, `utils/`, and types. Features are imported via `$features/feature-name/...`.

## License

This project is proprietary software. All rights reserved.

## Contributing

Contributions welcome! Please open an issue to discuss proposed changes before submitting a PR.
