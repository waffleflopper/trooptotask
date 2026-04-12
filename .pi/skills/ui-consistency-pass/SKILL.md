---
name: ui-consistency-pass
description: Brings Troop to Task UI work back in line with the shared component catalog, spacing, tokens, and typography. Use when touching UI, polishing screens, or correcting design-system drift.
---

# UI Consistency Pass

## Read first

Before changing UI, read:

- `../../../docs/component-catalog.md`
- `../../../src/app.css`
- The nearest feature module components that already solve similar UI problems

## Goals

- Prefer shared components over bespoke UI
- Use canonical tokens from `src/app.css`
- Keep spacing, typography, and hierarchy consistent with the product system
- Preserve responsive behavior and avoid accidental regressions

## Workflow

1. Inspect the current UI and identify which shared components already fit.
2. Replace one-off controls with shared primitives where practical.
3. Prefer canonical typography, spacing, radius, border, and semantic color tokens.
4. Keep forms, toolbars, badges, modals, and empty states aligned with the component catalog.
5. If you must introduce a new pattern, explain why the existing catalog was insufficient.
6. Verify responsive behavior and obvious text-overflow cases.
7. Before finishing, run:
   - `npm run format`
   - `npm run lint`
   - `npm run check`
   - `npm run test`

## Final response checklist

Include:

- Shared components reused
- Any new UI patterns introduced and why
- Responsive or accessibility risks still worth reviewing
- Verification commands run
