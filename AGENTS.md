# AGENTS.md

This codebase will outlive you. Every shortcut you take becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.
You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Task Completion Requirements

- All of `npm run format`, `npm run lint`, `npm run governance:check`, `npm run check` must pass before considering tasks completed.

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

## V1 Retrofit Governance

These docs describe the current v1 codebase truth, the intended guardrails going forward, and the major drift areas. Read them before work that touches architecture, auth/authz, provider boundaries, terminology, or cross-feature seams.

- **[V1 Architecture Contract](docs/architecture/ARCHITECTURE.md)**
- **[Authorization & Provider Boundaries](docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md)**
- **[Feature & Module Conventions](docs/architecture/MODULE_CONVENTIONS.md)**
- **[Definition of Done](docs/architecture/DEFINITION_OF_DONE.md)**
- **[AI Agent Operating Model](docs/architecture/AI_AGENT_OPERATING_MODEL.md)**
- **[Drift Ledger](docs/architecture/DRIFT_LEDGER.md)**
- **[V1 Change Intent](docs/architecture/V1_CHANGE_INTENT.md)**
- **[ADR Backlog](docs/architecture/ADR_BACKLOG.md)**
- **[ADR Guidance](docs/architecture/ADR_GUIDANCE.md)**
- **[Governance Checks](docs/architecture/GOVERNANCE_CHECKS.md)**
- **[V1 Retrofit Skills Guide](docs/architecture/V1_RETROFIT_SKILLS_GUIDE.md)**
- **[Ubiquitous Language](UBIQUITOUS_LANGUAGE.md)**

### Retrofit Guardrails

- Treat **`Organization`** and **`Group`** as canonical v1 domain terms. Do not back-port v2 `Account` / `Unit` / `Element` terminology into v1 current-state docs or code unless the task is explicitly about migration mapping.
- Treat the current authorization system as **tolerated current-state**, not as the desired end-state. Document what exists today, but do not deepen it by accident.
- Do not add new business logic that depends directly on `locals.supabase` or other provider-specific clients outside auth, ports/adapters, or an explicitly approved remediation slice.
- Do not deepen feature-permission piggybacking. If a feature currently borrows another feature's permission lane, treat that as drift to reduce, not a pattern to copy.
- Treat `docs/architecture/GOVERNANCE_BASELINE.json` as the explicit allowlist for currently tolerated route-level provider leaks and cross-feature permission couplings. If a remediation slice removes one, update the baseline and the related drift docs in the same change.
- When legacy clinic-specific names appear, preserve compatibility but prefer the Army/military-oriented canonical term in docs, UX copy, and new code shapes.
- If an incidental task encounters authorization semantics, membership modeling, scope evaluation, provider-boundary leaks, or other cross-feature architecture seams, stop after documenting the issue unless the task explicitly authorizes remediation in that area.
