# What's New Modal Design

**Date:** 2026-03-08
**Status:** Approved

## Overview

A "What's New" modal that shows users recent changes, bug fixes, and new features in plain language. Auto-shows on dashboard when there are unread entries. Also accessible anytime from the avatar menu.

## Data Source

TypeScript array in `src/lib/data/changelog.ts`. Each entry has an `id`, `date`, `title`, and `items` (plain-language bullet points). Entries ordered newest-first. Add a new entry to the top of the array before deploying.

```typescript
type ChangelogEntry = {
  id: string;        // e.g. '2026-03-08-permissions'
  date: string;       // 'YYYY-MM-DD'
  title: string;      // 'Improved Permissions'
  items: string[];    // plain-language bullet points
};
```

## Modal Behavior

- On org dashboard load, check `localStorage` for `changelog-last-seen-{userId}`
- If latest entry's `id` doesn't match stored value, auto-show the modal
- Latest entry displayed prominently at top (title, date, bullets)
- Older entries below in a scrollable list (last 10 max), visually smaller/muted
- "Got it" button closes and stores latest entry's `id` in localStorage
- Accessible anytime from avatar menu as "What's New" link (opens same modal manually)

## Modal Layout

- Uses existing `Modal.svelte` wrapper
- Latest entry: larger title, date, bullet list
- Divider, then "Earlier Updates" heading
- Older entries: smaller titles, condensed
- Footer: single "Got it" button (right-aligned)

## Read State

localStorage keyed by `changelog-last-seen-{userId}`. Stores the `id` of the last seen entry. Resets if browser data cleared (acceptable trade-off for no DB migration).

## Changes

| What | Action |
|------|--------|
| `src/lib/data/changelog.ts` | Create — changelog entries array + type |
| `src/lib/components/WhatsNewModal.svelte` | Create — modal component |
| `src/routes/org/[orgId]/+page.svelte` | Modify — auto-show modal on dashboard load |
| TopHeader avatar menu | Modify — add "What's New" link |
| Database | None |
| Dependencies | None |
