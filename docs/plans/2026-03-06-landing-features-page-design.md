# Landing Page Update + Features Page Design

**Date**: 2026-03-06
**Status**: Approved

## Problem

Users can't find features like counseling types and days off because they're hidden in overflow menus. The landing page is also out of date — missing Rating Scheme and In-Processing, and the roadmap still lists Leaders Book as "In Development" when it's live.

## Changes

### 1. Landing Page Features Grid (`src/routes/+page.svelte`)

Add 2 new feature cards to the existing 9:

- **Rating Scheme Tracker** — Track OER, NCOER, and WOER evaluations. See who's overdue, due in 30/60 days, and export to Excel.
- **In-Processing Checklist** — Custom onboarding templates with step-by-step tracking. See progress by person or pivot by step to find gaps.

Add a "See all features" link below the grid pointing to `/features`.

### 2. Roadmap Update

Add "Recently Shipped" items (green/completed badge):

- Digital Leaders Book
- Rating Scheme Tracker
- In-Processing Checklist

Keep future items:

- Event Sign-ups (Planned)
- Smart Notifications (Planned)
- Mobile App (Exploring)

### 3. Nav Update

Change Features link from `#features` anchor to `/features` route.
Update footer Features link similarly.

### 4. New Features Page (`src/routes/features/+page.svelte`)

Dedicated `/features` route with 7 alternating left/right sections.

**Layout**: Each section has text on one side and a CSS-animated demo mockup on the other. Direction alternates per section.

**Section structure**:

```
[Mono label]     "01 // CALENDAR"
[Serif title]    "See your entire unit at a glance."
[Description]    2-3 sentences
[Bullet points]  3-4 key capabilities
```

**7 sections with demo concepts**:

| #   | Feature                 | Demo                                                             |
| --- | ----------------------- | ---------------------------------------------------------------- |
| 01  | Visual Calendar         | Mini calendar grid with color-coded status cells + legend        |
| 02  | Personnel Management    | Roster list with rank/name rows, group headers, search bar       |
| 03  | Training Tracker        | Progress bars per cert type with color-coded expiration warnings |
| 04  | Leaders Book            | Counseling record entries, file attachment indicator, timeline   |
| 05  | In-Processing Checklist | Checklist with checkmarks, progress bar, completion counter      |
| 06  | Rating Scheme           | Table rows with eval types, due-status badges                    |
| 07  | Daily Assignments       | Duty roster with role badges, name assignments                   |

**Design system**: Same as landing page — Instrument Serif, DM Sans, DM Mono, brass (#B8943E) accent, dark panel mockups, light/dark theme support.

**Page elements**:

- Hero/header with page title
- 7 feature sections (alternating layout)
- CTA section at bottom
- Shared nav and footer (copied from landing page)

**Responsive**: Stacks to single column on tablet/mobile (< 1024px).

## Files

| Action | File                               |
| ------ | ---------------------------------- |
| Modify | `src/routes/+page.svelte`          |
| Create | `src/routes/features/+page.svelte` |
