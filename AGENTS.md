# TroopToTask — Claude Code Context

## Project Overview

Military unit management SaaS: personnel tracking, calendar/availability, training records, counseling (leader's book), daily assignments, onboarding workflows, unit management.

**Stack**: SvelteKit 2.5 + Svelte 5 (runes), TypeScript, Supabase (Postgres + Auth), no Tailwind — pure CSS variables, Vercel deployment.

---

## Do Not

- Reset, run migrations on, delete tables, delete entries, or touch the remote production database. I will manually run any migrations or sql code.
- Reset or delete tables from the local development database. If there's something wrong that requires it to be deleted or reset, you must ask for my permission first no matter what.

## File Organization

```
src/
  app.css                    — global design system + utility classes
  features/
    training/                — training types, matrix, reports, bulk import
    personnel/               — personnel CRUD, bulk import, extended info
    calendar/                — calendar views, availability, status, assignments
    counseling/              — counseling records, leaders book
    rating-scheme/           — rating scheme definitions and management
    onboarding/              — onboarding workflows, templates
    duty-roster/             — duty roster generation
    sign-in-rosters/         — sign-in roster generation
    groups/                  — group/member management
    dashboard/               — dashboard widgets and layout
  lib/
    components/ui/           — shared primitives (Badge, Spinner, EmptyState, FileUpload, DataTable)
    components/              — shared layout components (Modal, PageToolbar, TopHeader, etc.)
    server/
      entities/              — schema-first entity definitions (see docs/entity-system.md)
      entitySchema.ts        — defineEntity() framework (schema, transforms, Zod schemas)
      repositoryFactory.ts   — createRepository() used internally by entities
      permissionContext.ts   — builds PermissionContext from membership rows
      groupAccess.ts         — shared group access permission utilities
      personnelRepository.ts — specialized repository for complex personnel queries
      onboardingRepository.ts — specialized repository for complex onboarding queries
      ratingSchemeRepository.ts — specialized repository for rating scheme queries
      core/
        ports.ts             — port interfaces (DataStore, AuthContext, AuditPort, etc.)
        useCases/            — pure business logic use cases (no Supabase imports)
      adapters/
        httpAdapter.ts       — handle(), crudHandlers(), loadWithContext() for SvelteKit routes
        supabaseDataStore.ts — DataStore port implementation using Supabase
        scopedDataStore.ts   — ScopedDataStore wrapper (group-scoped access control)
        supabaseAuthContext.ts — AuthContext port implementation
        supabaseAudit.ts     — AuditPort implementation
        supabaseReadOnlyGuard.ts — ReadOnlyGuard implementation
        supabaseSubscription.ts — SubscriptionPort implementation
        supabaseNotification.ts — NotificationPort implementation
        supabaseStorage.ts   — StoragePort implementation (file uploads)
        stripeBilling.ts     — BillingPort implementation via Stripe
        adminAdapter.ts      — admin-scoped data access adapter
        inMemory.ts          — in-memory test adapters for all ports
    stores/                  — shared cross-cutting stores (groups, subscription, theme, etc.)
    types.ts                 — shared types (Personnel, permissions, ranks)
    utils/                   — shared utils (dates, csvParser, deletionRequests)
  routes/
    org/[orgId]/             — main app (thin shells importing from features)
      admin/                 — org admin panel (members, settings, audit)
      audit/                 — audit log viewer
      leaders-book/          — leaders book / counseling records
      settings/              — org settings
    auth/                    — login/callback
    billing/                 — subscription
```

**Path aliases**: `$features/*` → `src/features/*`, `$lib/*` → `src/lib/*`

Each feature module contains its own `components/`, `stores/`, `utils/`, and types file. Import feature code via `$features/feature-name/...`.

---

## Customer Facing Updates

We will keep customers updated via a "What's New" feature by adding information to `/src/lib/data/changelog.ts`. Only keep ~5 entires, old ones can fall off so the user doesn't have a huge scrolling modal to look at.

Use plain language and only update file for new/improved features or bug fixes that affect customers. Humorous quips are okay (e.g. improved the menu systems so it no longer requires a four year degree to figure out how to use it).

Not a technical report. Can group things together before making the plain language statement - e.g. changing four different queries or api calls to improve speed can become "Improved overall site speed and performance" - or - changing how bulk imports functioned becomes "Improved the overall experience of using bulk imports. Users should now find it to be more intuitive and easier to use".

---

## Reference Documentation

These docs contain detailed props, usage examples, and patterns. Read them when building or modifying UI components or server entities.

- **[Component Catalog & CSS Design System](docs/component-catalog.md)** — Shared UI component props (Modal, Badge, Spinner, EmptyState, FileUpload, DataTable, useDataTable), CSS variables, utility classes, button/form classes
- **[Entity System](docs/entity-system.md)** — `defineEntity()` pattern for database entities, field options, custom transforms, CRUD handlers, barrel exports
