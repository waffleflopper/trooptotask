# Navigation Redesign Design

## Problem

The current sidebar mixes three concerns into one 260px panel: site navigation (5 page links), page-specific tools (up to 12 items on calendar), and account/settings (6 footer items). On the calendar page this means ~23 items visible at once. The sidebar is not intuitive, wastes horizontal space, and is cluttered on every page.

## Solution

Replace the sidebar with three separated UI layers:

1. **Top Header Bar** — site navigation + account menu (layout-level, always visible)
2. **Page Toolbars** — page-specific actions with frequent buttons + overflow menu (per-page)
3. **Bottom Tab Bar** — mobile-only nav replacing the sidebar drawer

---

## Top Header Bar

Fixed top, 56px height, full width. Background: `#0F0F0F`.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  T2T  Troop to Task   │  Dashboard  Calendar  Personnel  Training  LB  │  [avatar] │
│  ─── wordmark ───────  │  ──────────── nav tabs ────────────────────────  │  ── usr ─ │
└──────────────────────────────────────────────────────────────────────────┘
```

**Left zone**: T2T badge + "Troop to Task" logotype (links to dashboard). Org name below/beside — clickable dropdown if multi-org, static text if single-org.

**Center zone**: Nav tabs — Dashboard, Calendar, Personnel, Training, Leaders Book. Active tab: brass `#B8943E` bottom border (2-3px). Permission-gated per existing rules.

**Right zone**: User avatar circle (initials, brass accent). Click opens account dropdown:
- Org name + role
- Org Settings
- Billing (if enabled)
- Theme toggle (Light/Dark)
- Help
- Sign Out

---

## Page Toolbars

Inline toolbar below header, part of page content (scrolls with page). Height ~44px. Background: `var(--color-surface)` with bottom border.

```
┌─────────────────────────────────────────────────────────────────┐
│  Page Title          [Action] [Action] [Action]    [⋮ More]    │
└─────────────────────────────────────────────────────────────────┘
```

### Per-page actions

**Dashboard**: No toolbar actions (summary page).

**Calendar**:
- Visible: Today's Breakdown, Assignments, 3-Month View
- Overflow: Bulk Status, Duty Roster, Export to Excel, Print/PDF, Show Status Text (toggle)
- Overflow "Configure" group: Status Types, Assignment Types, Holidays

**Personnel**:
- Visible: Add Person (primary CTA)
- Overflow: Bulk Import, Manage Groups

**Training**:
- Visible: Reports
- Overflow: Bulk Import, Manage Types, Reorder Columns

**Leaders Book**:
- Overflow: Counseling Types

**Overflow menu style**: Dropdown positioned below-right of the ⋮ button. Text items with optional icons. Dividers separate groups. Toggle items show checkmark when active.

---

## Mobile (< 640px)

### Bottom Tab Bar
Fixed bottom, 56px, `#0F0F0F` background. Icons + short labels for each page. Active tab: brass icon + label color. Permission-gated.

```
┌─────────────────────────────────────────────────┐
│  🏠    📅    👥    📋    📖                      │
│  Home  Cal  Pers  Train  LB                     │
└─────────────────────────────────────────────────┘
```

### Mobile Header
Simplified — no nav tabs (they're in the bottom bar):
```
┌─────────────────────────────────────────────────┐
│  T2T  Org Name                        [avatar]  │
└─────────────────────────────────────────────────┘
```

### Mobile Toolbar
Same as desktop but all action buttons collapse into the overflow menu. Page title + ⋮ button remain.

### Tablet (641-1024px)
Desktop layout with top header tabs. No bottom bar. Shorter tab labels if needed.

---

## Component Architecture

### New Components
- `TopHeader.svelte` — Fixed header with logo, nav tabs, org switcher, avatar menu. Rendered in org layout.
- `PageToolbar.svelte` — Reusable toolbar shell. Props: `title`, slot for visible buttons, `overflowItems` for ⋮ menu.
- `BottomTabBar.svelte` — Mobile-only bottom nav. Rendered in org layout.
- `OverflowMenu.svelte` — Dropdown for ⋮ button. Supports items, toggles, dividers, subgroups.
- `AvatarMenu.svelte` — Avatar circle + account dropdown. Used inside TopHeader.

### Deleted
- `Sidebar.svelte` — Entirely removed.

### Modified
- `+layout.svelte` — Renders TopHeader + BottomTabBar (nav moves from pages to layout).
- All page `+page.svelte` files — Remove Sidebar usage, remove `showSidebar` state, remove mobile headers. Add PageToolbar with page-specific actions.
- `app.css` — Remove `--sidebar-width` and `margin-left` rules. Add `--header-height` variable.

### Data Flow
- TopHeader receives layout data: orgId, orgName, permissions, allOrgs, userId.
- PageToolbar is self-contained per page with local callbacks (same pattern as current Sidebar props, but scoped to toolbar).
- No new stores needed.

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Calendar sidebar items | ~23 | 3 toolbar buttons + overflow |
| Horizontal space consumed | 260px sidebar | 0px (header is horizontal) |
| Nav component instances | 6 (one per page) | 1 (in layout) |
| Mobile nav pattern | Right drawer with all items | Bottom tab bar + overflow |
| Prop duplication | 50+ sidebar props across pages | ~10 layout props, per-page toolbar callbacks |
