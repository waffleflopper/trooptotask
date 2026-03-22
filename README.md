# Troop to Task

A military unit management platform for personnel tracking, calendar/availability, training records, counseling, onboarding, and daily assignments. Built with SvelteKit and Supabase.

## Features

### Dashboard
- Organization overview with key metrics at a glance
- Customizable dashboard widgets
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

### Counseling & Leader's Book
- Counseling record management (currently being redesigned)

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
- Demo mode with sandbox environment
- What's New changelog for users
- Feedback submission system

## Tech Stack

- **Framework**: SvelteKit 2.5 + Svelte 5 (runes)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL + Row Level Security)
- **Authentication**: Supabase Auth
- **Styling**: Pure CSS with custom properties (no Tailwind)
- **Payments**: Stripe (subscription billing)
- **Deployment**: Vercel
- **Testing**: Vitest (unit) + Playwright (E2E)

## Getting Started

### Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/waffleflopper/trooptotask.git
   cd trooptotask
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the local Supabase instance:

   ```bash
   supabase start
   ```

4. Create a `.env` file with your Supabase credentials:

   ```
   PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_local_service_role_key
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:5173](http://localhost:5173)

### Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run check        # TypeScript/Svelte type checking
npm run lint         # ESLint
npm run format       # Prettier formatting
npm run test         # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright)
```

## Project Structure

```
src/
  app.css                    # Global design system + CSS variables
  features/
    training/                # Training types, matrix, reports, bulk import
    personnel/               # Personnel CRUD, bulk import, extended info
    calendar/                # Calendar views, availability, status, assignments
    counseling/              # Counseling records, rating schemes, leader's book
    onboarding/              # Onboarding workflows, templates
    dashboard/               # Dashboard widgets and overview
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

## Demo

A demo account is available to explore the application with sample data:

- Visit the login page and click "Try Demo"
- No account creation required

## License

This project is proprietary software. All rights reserved.

## Contributing

Contributions welcome! Please open an issue to discuss proposed changes before submitting a PR.
