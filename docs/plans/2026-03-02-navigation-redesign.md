# Navigation Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the monolithic sidebar with a top header bar (site nav + avatar menu) and per-page toolbars (page-specific actions with overflow menus).

**Architecture:** The org layout (`+layout.svelte`) renders two new layout-level components — `TopHeader` and `BottomTabBar` (mobile). Each page renders its own `PageToolbar` with page-specific actions. The old `Sidebar.svelte` is deleted and all `--sidebar-width` / `margin-left` references are removed from every page.

**Tech Stack:** SvelteKit 2.5, Svelte 5 runes, TypeScript, pure CSS variables (no Tailwind).

**Design doc:** `docs/plans/2026-03-02-navigation-redesign-design.md`

---

### Task 1: Create OverflowMenu component

The dropdown menu used by the ⋮ button in toolbars and the avatar menu. Build this first since both `PageToolbar` and `AvatarMenu` depend on it.

**Files:**
- Create: `src/lib/components/ui/OverflowMenu.svelte`

**Step 1: Create the component**

This is a generic dropdown that positions itself below its trigger button. It accepts menu items as a prop array.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  export interface OverflowItem {
    label: string;
    icon?: string;           // SVG path string
    onclick?: () => void;
    href?: string;
    toggle?: boolean;        // is this a toggle item?
    active?: boolean;        // toggle state
    divider?: boolean;       // render a divider before this item
    group?: string;          // group label (rendered as a header before the item)
    danger?: boolean;        // red styling
    disabled?: boolean;
  }

  interface Props {
    items: OverflowItem[];
    open: boolean;
    onClose: () => void;
    align?: 'left' | 'right';  // default 'right'
  }

  let { items, open, onClose, align = 'right' }: Props = $props();
</script>
```

Features:
- Renders a positioned dropdown (absolute, below parent)
- Click-outside closes (attach `mousedown` listener on mount when `open`)
- Items with `onclick` call the handler then `onClose()`
- Items with `href` render `<a>` tags
- Items with `divider: true` render a horizontal line before them
- Items with `group` render a small uppercase label before the first item in that group
- Items with `toggle: true` render a checkmark on the right when `active`
- Items with `danger: true` get red text color
- `align: 'right'` means the dropdown's right edge aligns with the trigger's right edge

**Step 2: Commit**

```bash
git add src/lib/components/ui/OverflowMenu.svelte
git commit -m "feat: add OverflowMenu dropdown component"
```

---

### Task 2: Create AvatarMenu component

The user avatar circle + account dropdown in the top-right corner of the header.

**Files:**
- Create: `src/lib/components/ui/AvatarMenu.svelte`

**Step 1: Create the component**

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { isBillingEnabled } from '$lib/config/billing';
  import OverflowMenu from './OverflowMenu.svelte';
  import type { OverflowItem } from './OverflowMenu.svelte';

  interface OrgInfo {
    id: string;
    name: string;
    role: string;
  }

  interface Props {
    orgId: string;
    orgName: string;
    userRole: string;
    allOrgs?: OrgInfo[];
    onToggleTheme: () => void;
    isDarkTheme: boolean;
  }
</script>
```

Features:
- Renders initials-based avatar circle (first letter of org name, brass `#B8943E` background)
- Click toggles the dropdown open/closed
- Dropdown items: org name + role (non-clickable header), divider, Org Settings (`/org/{orgId}/settings`), Billing (`/billing`, only if `isBillingEnabled`), Theme toggle (Light/Dark, toggle item), Help (`/help`), divider, Sign Out (`/auth/logout`, danger styling)
- If `allOrgs.length > 1`, show an "Organizations" group with org list + "Manage Organizations" link before the divider (replicating the current org switcher behavior — clicking an org navigates to `/org/{newOrgId}` preserving the current path suffix)

**Step 2: Commit**

```bash
git add src/lib/components/ui/AvatarMenu.svelte
git commit -m "feat: add AvatarMenu component with account dropdown"
```

---

### Task 3: Create TopHeader component

The fixed top navigation bar.

**Files:**
- Create: `src/lib/components/TopHeader.svelte`

**Step 1: Create the component**

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import type { OrganizationMemberPermissions } from '$lib/types';
  import AvatarMenu from './ui/AvatarMenu.svelte';

  interface OrgInfo {
    id: string;
    name: string;
    role: string;
  }

  interface Props {
    orgId: string;
    orgName: string;
    userRole: string;
    userId: string | null;
    permissions: OrganizationMemberPermissions;
    allOrgs: OrgInfo[];
    onToggleTheme: () => void;
    isDarkTheme: boolean;
  }
</script>
```

Layout:
- Fixed top, `height: 56px`, `width: 100%`, `z-index: 100`, `background: #0F0F0F`, `color: #F0EDE6`
- **Left zone**: T2T brass badge + "Troop to Task" logotype (reuse exact styles from current sidebar header). Link to `/org/{orgId}`. Below the logotype, org name in muted text (or dropdown if multi-org — but org switching is in AvatarMenu, so just static text here).
- **Center zone**: Nav tabs as `<a>` tags. Dashboard, Calendar (if `canViewCalendar`), Personnel (if `canViewPersonnel`), Training (if `canViewTraining`), Leaders Book (if `canViewPersonnel`, with Beta badge). Active tab: brass `#B8943E` bottom border (3px), brass text color.
- **Right zone**: `<AvatarMenu>` component.

Responsive:
- **Mobile (< 640px)**: Hide the center nav tabs (hidden via `display: none`). Left zone shows just "T2T" badge. Right zone keeps avatar. The bottom tab bar handles navigation on mobile.
- **Desktop/Tablet**: Full layout as described.

CSS:
- Define `--header-height: 56px` in `:global(:root)` (replaces `--sidebar-width`)
- Use flexbox: `display: flex; align-items: center; justify-content: space-between`

**Step 2: Commit**

```bash
git add src/lib/components/TopHeader.svelte
git commit -m "feat: add TopHeader navigation bar component"
```

---

### Task 4: Create BottomTabBar component

Mobile-only bottom navigation.

**Files:**
- Create: `src/lib/components/BottomTabBar.svelte`

**Step 1: Create the component**

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import type { OrganizationMemberPermissions } from '$lib/types';

  interface Props {
    orgId: string;
    permissions: OrganizationMemberPermissions;
  }
</script>
```

Features:
- Fixed bottom, `height: 56px`, `background: #0F0F0F`, `z-index: 100`
- 5 tab items: Dashboard, Calendar, Personnel, Training, LB (short labels)
- Each tab: SVG icon (reuse the same icons from current sidebar nav items) + label below
- Active tab: brass `#B8943E` color for icon + label
- Permission-gated same as TopHeader tabs
- **Desktop**: `display: none` (only visible `@media (max-width: 640px)`)

**Step 2: Commit**

```bash
git add src/lib/components/BottomTabBar.svelte
git commit -m "feat: add BottomTabBar mobile navigation component"
```

---

### Task 5: Create PageToolbar component

Reusable toolbar shell that each page renders with its own actions.

**Files:**
- Create: `src/lib/components/PageToolbar.svelte`

**Step 1: Create the component**

```svelte
<script lang="ts">
  import OverflowMenu from './ui/OverflowMenu.svelte';
  import type { OverflowItem } from './ui/OverflowMenu.svelte';

  interface Props {
    title: string;
    overflowItems?: OverflowItem[];
    children?: import('svelte').Snippet;  // slot for visible action buttons
  }

  let { title, overflowItems = [], children }: Props = $props();
  let showOverflow = $state(false);
</script>
```

Layout:
- `height: 44px`, not fixed (scrolls with content)
- `background: var(--color-surface)`, `border-bottom: 1px solid var(--color-border)`
- **Left**: Page title (`<h2>`, using `--font-display`, `--font-size-lg`)
- **Right**: Slot for visible action buttons + ⋮ button (only shown if `overflowItems.length > 0`)
- ⋮ button opens `<OverflowMenu>`

Responsive:
- **Mobile (< 640px)**: Hide slotted action buttons (`display: none`). Only show title + ⋮. All actions go into the overflow menu on mobile (pages should include all items in `overflowItems` and also render the frequent ones in the slot — the slot hides on mobile so overflow is the only way to reach them).

**Step 2: Commit**

```bash
git add src/lib/components/PageToolbar.svelte
git commit -m "feat: add PageToolbar with overflow menu"
```

---

### Task 6: Wire TopHeader and BottomTabBar into the org layout

Move navigation from per-page to the layout.

**Files:**
- Modify: `src/routes/org/[orgId]/+layout.svelte`

**Step 1: Update the layout**

Add `TopHeader` and `BottomTabBar` to the layout. They need layout data (orgId, orgName, permissions, allOrgs, userRole, userId). The layout already has this data via `data` prop.

Import `TopHeader`, `BottomTabBar`, the theme store, and add:

```svelte
<TopHeader
  orgId={data.orgId}
  orgName={data.orgName}
  userRole={data.userRole}
  userId={data.userId}
  permissions={data.permissions}
  allOrgs={data.allOrgs}
  onToggleTheme={() => themeStore.toggle()}
  isDarkTheme={themeStore.isDark}
/>

<main class="app-content">
  {@render children()}
</main>

<BottomTabBar orgId={data.orgId} permissions={data.permissions} />
```

Add CSS:
```css
.app-content {
  padding-top: var(--header-height);
}

@media (max-width: 640px) {
  .app-content {
    padding-bottom: 56px;  /* BottomTabBar height */
  }
}
```

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/+layout.svelte
git commit -m "feat: add TopHeader and BottomTabBar to org layout"
```

---

### Task 7: Migrate Dashboard page

Remove Sidebar, add PageToolbar, clean up CSS.

**Files:**
- Modify: `src/routes/org/[orgId]/+page.svelte`

**Step 1: Update the page**

1. Remove `import Sidebar` and the `<Sidebar>` component usage
2. Remove `let showSidebar = $state(false)`
3. Remove the `<header class="page-header mobile-only">` block (mobile hamburger header)
4. Add `import PageToolbar from '$lib/components/PageToolbar.svelte'`
5. Add `<PageToolbar title="Dashboard" />` at the top of the page content
6. In CSS: remove `margin-left: var(--sidebar-width)` from `.page` and the tablet media query. Remove the `.page-header.mobile-only` styles and the `.mobile-menu-btn` styles.

**Step 2: Verify it renders**

Run: `npm run check`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/+page.svelte
git commit -m "refactor: migrate dashboard from sidebar to top header + toolbar"
```

---

### Task 8: Migrate Calendar page

The most complex migration — has the most page-specific tools.

**Files:**
- Modify: `src/routes/org/[orgId]/calendar/+page.svelte`

**Step 1: Update the page**

1. Remove `import Sidebar` and `<Sidebar>` usage (including all the callback props)
2. Remove `let showSidebar = $state(false)`
3. Remove the `<header class="page-header mobile-only">` block
4. Add `import PageToolbar from '$lib/components/PageToolbar.svelte'`
5. Add `import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte'`
6. Build the overflow items array:

```typescript
const calendarOverflowItems = $derived<OverflowItem[]>([
  // Only include items the user has permission for
  ...(data.permissions.canEditCalendar ? [
    { label: 'Bulk Status', onclick: () => (showBulkStatusModal = true) },
    { label: 'Duty Roster', onclick: () => (showDutyRosterGenerator = true) },
  ] : []),
  { label: 'Export to Excel', onclick: handleExportCSV, divider: true },
  { label: 'Print / PDF', onclick: handleExportPDF },
  { label: 'Show Status Text', toggle: true, active: calendarPrefsStore.showStatusText, onclick: () => calendarPrefsStore.toggleShowStatusText(), divider: true },
  // Configure group
  ...(data.permissions.canEditCalendar ? [
    { label: 'Status Types', onclick: () => (showStatusManager = true), divider: true, group: 'Configure' },
    { label: 'Assignment Types', onclick: () => (showAssignmentTypeManager = true) },
    { label: 'Holidays', onclick: () => (showSpecialDayManager = true) },
  ] : []),
]);
```

7. Add the toolbar with visible buttons + overflow:

```svelte
<PageToolbar title="Calendar" overflowItems={calendarOverflowItems}>
  <button class="btn btn-sm" onclick={() => (showTodayBreakdown = true)}>
    Today's Breakdown
  </button>
  {#if data.permissions.canEditCalendar}
    <button class="btn btn-sm" onclick={() => (showAssignmentPlanner = true)}>
      Assignments
    </button>
  {/if}
  <button class="btn btn-sm" onclick={() => (showLongRangeView = true)}>
    3-Month View
  </button>
</PageToolbar>
```

8. In CSS: remove `margin-left: var(--sidebar-width)` from `.page` and the tablet media query. Remove `.page-header.mobile-only` and `.mobile-menu-btn` styles. Remove the old `.toolbar-header` if it exists (the PageToolbar replaces it).

**Step 2: Verify**

Run: `npm run check`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/calendar/+page.svelte
git commit -m "refactor: migrate calendar from sidebar to top header + toolbar"
```

---

### Task 9: Migrate Personnel page

**Files:**
- Modify: `src/routes/org/[orgId]/personnel/+page.svelte`

**Step 1: Update the page**

1. Remove `import Sidebar` and `<Sidebar>` usage
2. Remove `let showSidebar = $state(false)`
3. Remove the mobile header block
4. Add PageToolbar with:
   - Visible: "Add Person" button (primary CTA, only if `canEditPersonnel`)
   - Overflow: Bulk Import, Manage Groups (only if `canEditPersonnel`)

```svelte
<PageToolbar title="Personnel" overflowItems={personnelOverflowItems}>
  {#if data.permissions.canEditPersonnel}
    <button class="btn btn-sm btn-primary" onclick={handleAdd}>
      Add Person
    </button>
  {/if}
</PageToolbar>
```

5. Clean up CSS: remove `margin-left: var(--sidebar-width)`, mobile header styles.

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/personnel/+page.svelte
git commit -m "refactor: migrate personnel from sidebar to top header + toolbar"
```

---

### Task 10: Migrate Training page

**Files:**
- Modify: `src/routes/org/[orgId]/training/+page.svelte`

**Step 1: Update the page**

1. Remove `import Sidebar` and `<Sidebar>` usage
2. Remove `let showSidebar = $state(false)`
3. Remove the mobile header block
4. Add PageToolbar with:
   - Visible: "Reports" button
   - Overflow: Bulk Import, Manage Types, Reorder Columns (only if `canEditTraining`)

```svelte
<PageToolbar title="Training & Certifications" overflowItems={trainingOverflowItems}>
  <button class="btn btn-sm" onclick={() => (showReports = true)}>
    Reports
  </button>
</PageToolbar>
```

5. Clean up CSS: remove `margin-left: var(--sidebar-width)`, mobile header styles, and the old `.toolbar-header` section.

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/training/+page.svelte
git commit -m "refactor: migrate training from sidebar to top header + toolbar"
```

---

### Task 11: Migrate Leaders Book page

**Files:**
- Modify: `src/routes/org/[orgId]/leaders-book/+page.svelte`

**Step 1: Update the page**

1. Remove `import Sidebar` and `<Sidebar>` usage
2. Remove `let showSidebar = $state(false)`
3. Remove the mobile header block
4. Add PageToolbar with:
   - No visible buttons
   - Overflow: Counseling Types (only if `canEditPersonnel`)

```svelte
<PageToolbar title="Leaders Book" overflowItems={leadersBookOverflowItems} />
```

5. Clean up CSS: remove `margin-left: var(--sidebar-width)`, mobile header styles.

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/leaders-book/+page.svelte
git commit -m "refactor: migrate leaders book from sidebar to top header + toolbar"
```

---

### Task 12: Migrate Settings page

**Files:**
- Modify: `src/routes/org/[orgId]/settings/+page.svelte`

**Step 1: Update the page**

1. Remove `import Sidebar` and `<Sidebar>` usage
2. Remove `let showSidebar = $state(false)`
3. Remove the mobile header block
4. Add `<PageToolbar title="Organization Settings" />`
5. Clean up CSS: remove `margin-left: var(--sidebar-width)`, mobile header styles.

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/settings/+page.svelte
git commit -m "refactor: migrate settings from sidebar to top header + toolbar"
```

---

### Task 13: Delete Sidebar.svelte and clean up

**Files:**
- Delete: `src/lib/components/Sidebar.svelte`
- Modify: `src/app.css` (if any `--sidebar-width` references exist there — currently none, but verify)

**Step 1: Delete the sidebar**

```bash
git rm src/lib/components/Sidebar.svelte
```

**Step 2: Verify no remaining references**

Search for any remaining imports or references to `Sidebar`:

```bash
grep -r "Sidebar" src/ --include="*.svelte" --include="*.ts"
```

Expected: No results (all pages have been migrated).

Search for any remaining `--sidebar-width`:

```bash
grep -r "sidebar-width" src/ --include="*.svelte" --include="*.css"
```

Expected: No results.

**Step 3: Full build verification**

Run: `npm run check && npm run build`
Expected: 0 errors, build succeeds

**Step 4: Commit**

```bash
git rm src/lib/components/Sidebar.svelte
git commit -m "refactor: delete Sidebar.svelte — navigation fully migrated to header + toolbars"
```

---

### Task 14: Final verification and polish

**Step 1: Full type check and build**

```bash
npm run check && npm run build
```

Expected: 0 new errors, build succeeds.

**Step 2: Visual review checklist**

Test each page manually:
- [ ] Dashboard: header shows, nav tabs work, avatar menu works, no sidebar remnants
- [ ] Calendar: header, toolbar with 3 buttons + overflow, all modals still open correctly
- [ ] Personnel: header, toolbar with Add Person + overflow
- [ ] Training: header, toolbar with Reports + overflow
- [ ] Leaders Book: header, toolbar with overflow only
- [ ] Settings: header, toolbar title only
- [ ] Mobile (< 640px): bottom tab bar shows, header simplifies, toolbar overflow works
- [ ] Org switching: avatar menu org list works, preserves current page
- [ ] Theme toggle: works from avatar menu
- [ ] Demo mode: header renders correctly without user data

**Step 3: Commit any polish fixes**

```bash
git add -A
git commit -m "fix: navigation redesign polish and cleanup"
```
