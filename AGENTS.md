# AGENTS.md

This codebase will outlive you. Every shortcut you take becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.
You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Task Completion Requirements

- All of `npm run format`, `npm run lint`, `npm run check` must pass before considering tasks completed.

- ALWAYS use `npm run test` to run tests (runs Vitest).

## Project Overview

- Military unit management SaaS: personnel tracking, calendar/availability, training records, daily assignments, onboarding workflows, unit management. Built on typescript and SvelteKit (Svelte 5 with runes)

## Pi Workflow Shortcuts

Project-local pi resources live under `.pi/`.

- `/plan` — planning preset with read-only investigation tools
- `/build` — implementation preset with coding + verification tools
- `/ship` — final-pass preset for polish, verification, and explicit follow-ups
- `/verify [all|format|lint|check|test] [--fail-fast]` — required repo verification workflow (`/verify help` for usage)
- `/feature`, `/bugfix`, `/ui-pass`, `/ship-pass` — reusable prompt templates
- `/skill:trooptotask-feature`, `/skill:safe-supabase-change`, `/skill:ui-consistency-pass` — force a specific repo workflow when needed

---

## Core Priorities

1. Performance first

2. Reliability first

3. Choose correctness and robustness over short-term convenience.

4. Adhering to best practices and industry standards

5. Maximizing user experience.

## Do Not

- Reset, run migrations on, delete tables, delete entries, or touch the remote production database. Notify user that migrations need to be ran on remote before merging.
- Reset or delete tables from the local development database. If there's something wrong that requires it to be deleted or reset, you must ask for my permission first no matter what.

## Demo/Sandbox Deprecation

- Demo sandbox and demo-specific access flows are deprecated and being phased out.
- When you encounter code that exists specifically for demo mode or sandbox behavior, treat it as deprecated for later removal.
- Do not expand or deepen demo/sandbox-specific behavior unless explicitly asked.
- If you touch demo/sandbox-specific code, prefer adding or preserving a clear deprecation note/TODO so it is easier to remove in a future cleanup pass.

## File Organization

**Path aliases**: `$features/*` → `src/features/*`, `$lib/*` → `src/lib/*`

- Each feature module contains its own `components/`, `stores/`, `utils/`, and types file. Import feature code via `$features/feature-name/...` When making a new feature, use the same structure patterns as other features.

---

## Reference Documentation

These docs contain detailed props, usage examples, and patterns. Read them when building or modifying UI components or server entities.

- **[Component Catalog & CSS Design System](docs/component-catalog.md)** — Shared UI component props (Modal, Badge, Spinner, EmptyState, FileUpload, DataTable, useDataTable), CSS variables, utility classes, button/form classes
