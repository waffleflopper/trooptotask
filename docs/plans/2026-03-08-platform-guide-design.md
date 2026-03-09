# Platform Guide Design

**Date:** 2026-03-08
**Status:** Approved

## Overview

Replace the existing `/help` page with a richer platform guide organized by feature, with role callouts within each section. Add a dismissable welcome banner on the org dashboard for first-time users.

## Goals

- Help new users (all roles) understand the platform features
- Explain the permission model so team leaders understand their scoped access
- Provide a persistent reference accessible anytime from the avatar menu
- Nudge first-time users toward the guide without being intrusive

## Design Decisions

- **By feature, not by role** — sections organized by feature (Calendar, Personnel, Training, etc.) with role callouts inline where the distinction matters
- **Replace `/help`** — no separate `/guide` page; the improved content subsumes existing help
- **Icons + text, no screenshots** — screenshots go stale; clear text with role callouts is more maintainable
- **Dismissable banner, not modal** — less intrusive than a modal, doesn't block the dashboard
- **localStorage for dismissal** — no server-side tracking needed; keyed per user+org

## Page Structure

### Sections (in order)

1. **Getting Started** — what the app does, navigation, theme toggle
2. **Dashboard** — dashboard cards overview, customization
3. **Calendar** — monthly view, adding statuses, bulk status, 3-month view, daily assignments, duty roster, export
4. **Personnel** — view modes, adding/editing, groups, bulk import/delete, search
5. **Training** — matrix, expiration colors, recording, types, reports, bulk import
6. **Onboarding** — templates, enrolling personnel, step types, progress tracking
7. **Leaders Book** — counseling records, development goals (Beta)
8. **Settings & Members** — org settings, inviting members, permission presets, transfer/delete
9. **Roles & Permissions** — permission model explanation, presets, group scoping, full-editor detection, deletion approvals
10. **Admin Hub** — audit log, deletion approvals (admin/owner only)
11. **Tips & Shortcuts** — quick org switch, pinned groups, keyboard nav, mobile usage

### Role Callouts

Inline callout blocks within feature sections where role distinction matters. Three styles:

- **Admin/Owner** (indigo left border) — e.g. "You can manage types, bulk operations, and export from the toolbar overflow menu."
- **Team Leader** (amber/gold left border) — e.g. "You'll only see personnel in your assigned group. Calendar remains org-wide for visibility."
- **Viewer** (gray left border) — e.g. "You can see this page but cannot make changes."

Only added where the distinction is meaningful — not every section needs all three.

Styling: variant of existing `.help-item` with different left-border color and a small bold role label.

### Roles & Permissions Section Content

- **Role hierarchy** — Owner > Admin > Member with what each level gets
- **Permission presets** — Admin, Full Editor, Team Leader, Viewer, Custom with one-line descriptions
- **Group scoping** — team leaders scoped to a group see only their group's personnel; calendar stays org-wide
- **Full Editor** — member with all 11 permission toggles on; gets type managers, bulk ops, export
- **Deletion approvals** — non-privileged users request deletions; admins/owners approve from Admin Hub

## Welcome Banner

- Location: top of org dashboard (`/org/[orgId]/+page.svelte`), above dashboard cards
- Style: light surface background, indigo left border, matches help-item aesthetic
- Content: "Welcome to Troop to Task!" + "New here? Check out the platform guide to learn what you can do." + "View Guide" link
- Dismiss: "X" button, persisted in `localStorage` keyed by `guide-dismissed-{userId}-{orgId}`
- No server-side tracking

## What Changes

| What | Action |
|------|--------|
| `/help` page content | Replace — reorganize into 11 sections with role callouts |
| `/help` page styling | Extend — add `.role-callout` variant with colored borders |
| Org dashboard | Add — dismissable welcome banner at top |
| New components | None |
| New routes | None |
| New dependencies | None |
| Database changes | None |
