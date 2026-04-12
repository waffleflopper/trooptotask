---
name: trooptotask-feature
description: Implements or refactors Troop to Task features using the repo's feature-module, server, testing, and UI conventions. Use when changing product behavior, adding a feature, or wiring a bug fix through the app.
---

# Troop to Task Feature Workflow

## Read first

Before making changes, read these files for project context:

- `../../../AGENTS.md`
- `../../../README.md`
- `../../../docs/component-catalog.md` when the work touches UI

## Goals

- Follow existing feature-module patterns under `src/features/*`
- Keep route files under `src/routes/**` thin when a feature module already exists
- Prefer shared UI primitives and canonical design tokens
- Preserve performance, reliability, and user experience
- Add or update tests near the affected behavior

## Workflow

1. Identify the primary feature area under `src/features/*` and the route shell(s) under `src/routes/**`.
2. Inspect nearby components, stores, utils, server adapters/entities, and tests before editing.
3. Reuse existing patterns before introducing a new abstraction.
4. If the change touches UI, prefer components from `src/lib/components/` and `src/lib/components/ui/`.
5. If the change touches server behavior, inspect the related entity, adapter, and tests together.
6. Keep demo/sandbox-specific behavior deprecated; do not expand it unless explicitly asked.
7. Before finishing, run:
   - `npm run format`
   - `npm run lint`
   - `npm run check`
   - `npm run test`

## Implementation reminders

- Import feature code via `$features/*` and shared code via `$lib/*`
- Prefer surgical edits over broad rewrites
- Keep error handling and edge cases explicit
- When behavior changes, explain the impact and list follow-up risks

## Output checklist

Your final response should include:

- Files changed
- Tests added or updated
- Verification commands run
- Any manual follow-ups still required
