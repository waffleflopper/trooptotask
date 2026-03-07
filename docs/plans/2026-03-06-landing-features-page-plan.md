# Landing Page + Features Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the landing page features grid and roadmap, then create a new `/features` page with 7 alternating sections featuring animated CSS demos.

**Architecture:** Modify `src/routes/+page.svelte` for grid/roadmap/nav changes. Create `src/routes/features/+page.svelte` as a standalone page reusing the landing page's design system (Instrument Serif, DM Sans, DM Mono, brass accent, dark/light theme). No shared layout component — each page is self-contained with scoped styles.

**Tech Stack:** SvelteKit 2.5, Svelte 5 (runes), pure CSS (no Tailwind), Google Fonts

---

### Task 1: Update Landing Page Features Grid

**Files:**
- Modify: `src/routes/+page.svelte` (lines 6-53, features array + grid markup)

**Step 1: Add two new feature entries to the `features` array**

Insert after the existing `'Export & Print'` entry (line 52):

```typescript
{
    icon: 'star',
    title: 'Rating Scheme Tracker',
    description: 'Track OER, NCOER, and WOER evaluations. See who\'s overdue, due in 30/60 days, and export to Excel.'
},
{
    icon: 'checklist',
    title: 'In-Processing Checklist',
    description: 'Custom onboarding templates with step-by-step tracking. See progress by person or pivot by step to find gaps.'
}
```

**Step 2: Add SVG paths for the new icons**

In the `getFeatureIcon` function's `icons` record, add:

```typescript
star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
checklist: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6M9 14l2 2 4-4M9 11h.01'
```

**Step 3: Add "See all features" link below the grid**

After the closing `</div>` of `.features-grid` (around line 305), add:

```svelte
<div class="features-cta">
    <a href="/features" class="features-link">
        See all features
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
    </a>
</div>
```

**Step 4: Add CSS for the features link**

Add after the `.feature-description` rule:

```css
.features-cta {
    margin-top: 2rem;
    text-align: center;
}

.features-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--brass);
    text-decoration: none;
    letter-spacing: 0.02em;
    transition: color 0.15s;
}

.features-link:hover {
    color: var(--brass-light);
}

.features-link svg {
    width: 14px;
    height: 14px;
}
```

**Step 5: Verify and commit**

Run: `npm run check && npm run build`
Expected: 0 errors, build succeeds

```bash
git add src/routes/+page.svelte
git commit -m "feat: add rating scheme and in-processing to landing page features grid"
```

---

### Task 2: Update Landing Page Roadmap

**Files:**
- Modify: `src/routes/+page.svelte` (lines 55-80, roadmap array + markup + CSS)

**Step 1: Replace the roadmap array**

Replace the entire `roadmap` const with:

```typescript
const shipped = [
    {
        title: 'Digital Leaders Book',
        description: 'Centralized soldier information, counseling records, and development tracking.',
    },
    {
        title: 'Rating Scheme Tracker',
        description: 'OER, NCOER, and WOER evaluation tracking with due-status alerts and Excel export.',
    },
    {
        title: 'In-Processing Checklist',
        description: 'Custom onboarding templates with step-by-step progress tracking per person.',
    }
];

const roadmap = [
    {
        title: 'Event Sign-ups',
        description: 'Coordinate range days, ACFT, and unit events with built-in sign-up sheets.',
        status: 'Planned',
        statusClass: 'planned'
    },
    {
        title: 'Smart Notifications',
        description: 'Get alerts for expiring training, coverage gaps, and assignment conflicts.',
        status: 'Planned',
        statusClass: 'planned'
    },
    {
        title: 'Mobile App',
        description: 'Native iOS and Android apps for on-the-go access and push notifications.',
        status: 'Exploring',
        statusClass: 'exploring'
    }
];
```

**Step 2: Update the roadmap section markup**

Replace the roadmap section (the `<section id="roadmap" ...>` block) with:

```svelte
<section id="roadmap" class="roadmap">
    <div class="section-container">
        <div class="section-label">Roadmap</div>
        <h2 class="section-title">What we've built,<br /><em>and what's next.</em></h2>

        <div class="roadmap-shipped">
            <h3 class="roadmap-group-title">Recently Shipped</h3>
            {#each shipped as item}
                <div class="shipped-entry">
                    <div class="shipped-check">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </div>
                    <div>
                        <h4 class="shipped-title">{item.title}</h4>
                        <p class="shipped-description">{item.description}</p>
                    </div>
                </div>
            {/each}
        </div>

        <div class="roadmap-timeline">
            <h3 class="roadmap-group-title">Coming Next</h3>
            {#each roadmap as item, i}
                <div class="roadmap-entry">
                    <div class="roadmap-marker">
                        <div class="marker-dot {item.statusClass}"></div>
                        {#if i < roadmap.length - 1}
                            <div class="marker-line"></div>
                        {/if}
                    </div>
                    <div class="roadmap-content">
                        <div class="roadmap-status-badge {item.statusClass}">{item.status}</div>
                        <h3 class="roadmap-title">{item.title}</h3>
                        <p class="roadmap-description">{item.description}</p>
                    </div>
                </div>
            {/each}
        </div>
    </div>
</section>
```

**Step 3: Add CSS for shipped items and group titles**

Add after the existing `.roadmap-description` rule:

```css
.roadmap-group-title {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
    margin-bottom: 1.25rem;
}

.roadmap-shipped {
    margin-top: 3rem;
    margin-bottom: 3rem;
    max-width: 640px;
}

.shipped-entry {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    margin-bottom: 1.25rem;
}

.shipped-check {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(76, 175, 80, 0.15);
    color: #4caf50;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 0.125rem;
}

.shipped-title {
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 400;
    margin-bottom: 0.125rem;
}

.shipped-description {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    line-height: 1.5;
    margin: 0;
}
```

**Step 4: Verify and commit**

Run: `npm run check && npm run build`
Expected: 0 errors, build succeeds

```bash
git add src/routes/+page.svelte
git commit -m "feat: update roadmap with recently shipped section"
```

---

### Task 3: Update Nav and Footer Links

**Files:**
- Modify: `src/routes/+page.svelte` (nav and footer sections)

**Step 1: Update nav Features link**

Change `<a href="#features" class="nav-link">Features</a>` to:
```svelte
<a href="/features" class="nav-link">Features</a>
```

**Step 2: Update footer Features link**

Change `<a href="#features">Features</a>` to:
```svelte
<a href="/features">Features</a>
```

**Step 3: Verify and commit**

Run: `npm run check && npm run build`
Expected: 0 errors, build succeeds

```bash
git add src/routes/+page.svelte
git commit -m "feat: link nav and footer to /features page"
```

---

### Task 4: Create Features Page — Scaffold + Nav/Footer/Hero

**Files:**
- Create: `src/routes/features/+page.svelte`

**Step 1: Create the route directory**

```bash
mkdir -p src/routes/features
```

**Step 2: Create the page with imports, nav, hero header, CTA, and footer**

Create `src/routes/features/+page.svelte`. The page needs:
- Same `<svelte:head>` with Google Fonts as landing page
- Same classification bar, nav, and footer (copy from landing page, nav Features link should be active/highlighted)
- Hero-style header section with title: "Everything your unit needs." and subtitle explaining the page
- CTA section at bottom (same as landing)
- Landing page CSS variables (--font-display, --font-body, --font-mono, --brass, etc.)
- Import `themeStore` for theme toggle
- Get `data` from `$props()` for user auth state (controls CTA text)

The page structure:

```svelte
<script lang="ts">
    import { themeStore } from '$lib/stores/theme.svelte';
    let { data } = $props();
</script>

<svelte:head>
    <title>Features — Troop to Task</title>
    <meta name="description" content="..." />
    <!-- Same Google Fonts link as landing page -->
</svelte:head>

<div class="features-page">
    <!-- Classification Bar (same as landing) -->
    <!-- Nav (same as landing, Features link active) -->
    <!-- Page Header -->
    <!-- Feature Sections (Task 5-7) -->
    <!-- CTA (same as landing) -->
    <!-- Footer (same as landing) -->
</div>
```

Also create `src/routes/features/+page.server.ts` to pass user data:

```typescript
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    return {
        user: locals.user ?? null
    };
};
```

Check how the landing page's `+page.server.ts` works to match the pattern.

**Step 3: Add base styles**

Copy the shared CSS from the landing page: `.features-page` wrapper (same as `.landing`), classification bar, nav, footer, CTA, section-container, section-label, section-title, and all responsive overrides for these shared elements.

Add a new `.page-header` style for the features page hero:

```css
.page-header {
    background: var(--hero-bg);
    padding: 5rem 2rem 4rem;
    position: relative;
    overflow: hidden;
}

.page-header-content {
    max-width: 1200px;
    margin: 0 auto;
    text-align: center;
}

.page-header h1 {
    font-family: var(--font-display);
    font-size: 3rem;
    font-weight: 400;
    color: var(--hero-text);
    margin-bottom: 1rem;
}

.page-header h1 em {
    font-style: italic;
    color: var(--brass);
}

.page-header p {
    font-size: 1.0625rem;
    color: var(--hero-muted);
    max-width: 560px;
    margin: 0 auto;
    line-height: 1.7;
}
```

**Step 4: Verify and commit**

Run: `npm run check && npm run build`
Expected: 0 errors, build succeeds. Page should load at `/features`.

```bash
git add src/routes/features/
git commit -m "feat: scaffold features page with nav, header, CTA, footer"
```

---

### Task 5: Features Page — Sections 1-3 (Calendar, Personnel, Training)

**Files:**
- Modify: `src/routes/features/+page.svelte`

**Step 1: Add the alternating section layout CSS**

```css
.feature-section {
    padding: 6rem 0;
    border-bottom: 1px solid var(--color-border);
}

.feature-section:nth-child(even) {
    background: var(--paper-warm);
}

:global([data-theme='dark']) .feature-section:nth-child(even) {
    background: var(--color-surface);
}

.feature-section-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5rem;
    align-items: center;
}

.feature-section.reverse .feature-section-inner {
    direction: rtl;
}

.feature-section.reverse .feature-section-inner > * {
    direction: ltr;
}

.feature-text .feature-label {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--brass);
    margin-bottom: 0.75rem;
}

.feature-text h2 {
    font-family: var(--font-display);
    font-size: 2.25rem;
    font-weight: 400;
    line-height: 1.15;
    margin-bottom: 1rem;
}

.feature-text h2 em {
    font-style: italic;
}

.feature-text .feature-desc {
    font-size: 1rem;
    color: var(--color-text-secondary);
    line-height: 1.7;
    margin-bottom: 1.5rem;
}

.feature-text ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
}

.feature-text li {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
    line-height: 1.5;
}

.feature-text li::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--brass);
    flex-shrink: 0;
    margin-top: 0.5rem;
}
```

**Step 2: Add shared demo panel CSS**

The demo panels should look like the hero's dashboard preview — dark background, border, rounded corners:

```css
.demo-panel {
    background: var(--ink-light);
    border: 1px solid var(--ink-border);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.03), 0 20px 60px rgba(0,0,0,0.3);
}

.demo-chrome {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--ink-border);
    background: rgba(255,255,255,0.02);
}

.demo-dots {
    display: flex;
    gap: 5px;
}

.demo-dots span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ink-border);
}

.demo-label {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: var(--hero-muted);
    letter-spacing: 0.02em;
}

.demo-body {
    padding: 1.25rem;
}
```

**Step 3: Add Section 01 — Visual Calendar**

Markup:
```svelte
<section class="feature-section">
    <div class="feature-section-inner">
        <div class="feature-text">
            <div class="feature-label">01 // Calendar</div>
            <h2>See your entire unit <em>at a glance.</em></h2>
            <p class="feature-desc">
                A visual calendar that replaces the whiteboard. Color-coded statuses make it
                instant to see who's available, who's on leave, and where the gaps are.
            </p>
            <ul>
                <li>Color-coded statuses: leave, TDY, school, appointments, and custom types</li>
                <li>Month and 3-month views for long-range planning</li>
                <li>Coverage analytics show strength percentages per day</li>
                <li>Print-ready exports for posting on the board</li>
            </ul>
        </div>
        <div class="demo-panel">
            <!-- Calendar demo: reuse/extend the mini-calendar from hero -->
            <div class="demo-chrome">
                <div class="demo-dots"><span></span><span></span><span></span></div>
                <span class="demo-label">Calendar</span>
            </div>
            <div class="demo-body">
                <!-- Mini calendar with more rows than hero version -->
                <!-- Day headers + 4 weeks of color-coded cells -->
                <!-- Legend row at bottom -->
            </div>
        </div>
    </div>
</section>
```

Build out the calendar demo with a full month grid (M-F headers + 4 rows of cells with mixed statuses) plus legend. Reuse `.cal-*` class patterns from landing page but scope them to `.features-page`.

**Step 4: Add Section 02 — Personnel Management (reversed)**

```svelte
<section class="feature-section reverse">
    <div class="feature-section-inner">
        <div class="feature-text">
            <div class="feature-label">02 // Personnel</div>
            <h2>Organize your roster, <em>your way.</em></h2>
            <p class="feature-desc">
                Build your unit's roster with groups and sections. Track rank, MOS, role,
                and contact info. Bulk import from any spreadsheet to get started fast.
            </p>
            <ul>
                <li>Organize by platoon, section, or custom groups</li>
                <li>Bulk import from spreadsheets — paste or upload</li>
                <li>Track rank, MOS, role, and contact information</li>
                <li>Pin frequently-used groups for quick access</li>
            </ul>
        </div>
        <div class="demo-panel">
            <div class="demo-chrome">
                <div class="demo-dots"><span></span><span></span><span></span></div>
                <span class="demo-label">Personnel</span>
            </div>
            <div class="demo-body">
                <!-- Roster demo: search bar + group header + 3-4 personnel rows -->
                <!-- Each row: rank badge, name, MOS, role pill -->
            </div>
        </div>
    </div>
</section>
```

Build out the personnel demo: a search bar mockup, a "1st Platoon" group header, and 3-4 roster rows showing rank/name/MOS with small role badges.

**Step 5: Add Section 03 — Training Tracker**

```svelte
<section class="feature-section">
    <!-- Same pattern, feature-label "03 // Training" -->
    <!-- Title: "Never miss an expiration again." -->
    <!-- Bullets: color-coded warnings, certification tracking, org-wide view, Excel export -->
    <!-- Demo: training table rows with cert name, expiration date, status badge (Current/Due 30/Expired) -->
</section>
```

Build out the training demo: 4-5 training rows with name, progress bar, and color-coded status indicator (green = current, amber = expiring soon, red = expired).

**Step 6: Add CSS specific to demo internals for sections 1-3**

Add scoped CSS for calendar demo cells, personnel roster rows, training bars, etc. Follow the patterns from the landing page hero but at slightly larger scale since these demos have more room.

**Step 7: Verify and commit**

Run: `npm run check && npm run build`
Expected: 0 errors, build succeeds

```bash
git add src/routes/features/+page.svelte
git commit -m "feat: add calendar, personnel, and training feature sections"
```

---

### Task 6: Features Page — Sections 4-5 (Leaders Book, In-Processing)

**Files:**
- Modify: `src/routes/features/+page.svelte`

**Step 1: Add Section 04 — Leaders Book (reversed)**

```svelte
<section class="feature-section reverse">
    <!-- feature-label "04 // Leaders Book" -->
    <!-- Title: "Your digital counseling packet." -->
    <!-- Desc: Centralized soldier records, counseling sessions, development plans -->
    <!-- Bullets: counseling records with PDF upload, development goal tracking, timeline view, file attachments -->
    <!-- Demo: 2-3 counseling entries with date, type badge, file icon, status -->
</section>
```

Demo: A mini timeline/card layout with 2-3 counseling record entries. Each has a date, counseling type badge (Initial/Quarterly), a paperclip icon for attachments, and a one-line summary.

**Step 2: Add Section 05 — In-Processing Checklist**

```svelte
<section class="feature-section">
    <!-- feature-label "05 // In-Processing" -->
    <!-- Title: "Onboard new personnel with confidence." -->
    <!-- Desc: Custom checklist templates, track each step per person -->
    <!-- Bullets: customizable step templates, per-person progress, pivot-by-step report view, completion tracking -->
    <!-- Demo: checklist with 5-6 items, some checked, progress bar at top showing "4 of 6 complete" -->
</section>
```

Demo: A progress bar at top (e.g. 67% complete, "4 of 6 steps"), then 5-6 checklist rows with checkbox states (some filled green, some empty), step names like "DEERS enrollment", "CAC pickup", etc.

**Step 3: Add CSS for leaders book and checklist demo internals**

```css
/* Leaders Book demo */
.demo-timeline-entry { ... }
.demo-type-badge { ... }
.demo-file-icon { ... }

/* Checklist demo */
.demo-progress { ... }
.demo-checklist-item { ... }
.demo-checkbox { ... }
.demo-checkbox.checked { ... }
```

**Step 4: Verify and commit**

Run: `npm run check && npm run build`

```bash
git add src/routes/features/+page.svelte
git commit -m "feat: add leaders book and in-processing feature sections"
```

---

### Task 7: Features Page — Sections 6-7 (Rating Scheme, Daily Assignments)

**Files:**
- Modify: `src/routes/features/+page.svelte`

**Step 1: Add Section 06 — Rating Scheme (reversed)**

```svelte
<section class="feature-section reverse">
    <!-- feature-label "06 // Rating Scheme" -->
    <!-- Title: "Stay ahead of every evaluation." -->
    <!-- Desc: Track OER, NCOER, WOER evaluations with due-date tracking -->
    <!-- Bullets: OER/NCOER/WOER support, due-status alerts (overdue/30/60 days), Excel export, dashboard summary card -->
    <!-- Demo: table with 3-4 rows: name, eval type badge (OER/NCOER), due date, status badge (Overdue/Due 30/Current) -->
</section>
```

Demo: A mini table with headers (Name, Type, Due, Status) and 3-4 rows. Each row has a name, eval type pill (OER in blue, NCOER in purple), a date, and a status badge (Overdue = red, Due 30 = amber, Current = green).

**Step 2: Add Section 07 — Daily Assignments**

```svelte
<section class="feature-section">
    <!-- feature-label "07 // Daily Assignments" -->
    <!-- Title: "Plan the duty roster in minutes." -->
    <!-- Desc: Assign MOD, CQ, and custom duties. Auto-generate fair rosters. -->
    <!-- Bullets: custom assignment types, auto-generation based on availability, month-at-a-glance planner, fair distribution tracking -->
    <!-- Demo: duty roster with date header, 3-4 assignment rows with role badge + name -->
</section>
```

Demo: A date selector mockup at top, then 3-4 duty rows (same pattern as hero's duty panel but with more detail — role badge, name, count badge showing past assignments).

**Step 3: Add CSS for rating scheme and assignments demo internals**

```css
/* Rating Scheme demo */
.demo-eval-table { ... }
.demo-eval-type { ... }
.demo-eval-status { ... }
.demo-eval-status.overdue { ... }
.demo-eval-status.due-30 { ... }
.demo-eval-status.current { ... }

/* Assignments demo */
.demo-duty-header { ... }
.demo-duty-row { ... }
.demo-duty-badge { ... }
```

**Step 4: Verify and commit**

Run: `npm run check && npm run build`

```bash
git add src/routes/features/+page.svelte
git commit -m "feat: add rating scheme and daily assignments feature sections"
```

---

### Task 8: Responsive Styles for Features Page

**Files:**
- Modify: `src/routes/features/+page.svelte`

**Step 1: Add tablet responsive styles (max-width: 1024px)**

```css
@media (max-width: 1024px) {
    .feature-section-inner {
        grid-template-columns: 1fr;
        gap: 3rem;
    }

    .feature-section.reverse .feature-section-inner {
        direction: ltr;
    }

    .feature-text h2 {
        font-size: 1.875rem;
    }

    .page-header {
        padding: 4rem 1.5rem 3rem;
    }

    .page-header h1 {
        font-size: 2.5rem;
    }
}
```

**Step 2: Add mobile responsive styles (max-width: 640px)**

```css
@media (max-width: 640px) {
    .feature-section {
        padding: 4rem 0;
    }

    .feature-section-inner {
        padding: 0 1rem;
        gap: 2rem;
    }

    .feature-text h2 {
        font-size: 1.5rem;
    }

    .page-header {
        padding: 3rem 1rem 2.5rem;
    }

    .page-header h1 {
        font-size: 2rem;
    }

    .demo-body {
        padding: 0.75rem;
    }
}
```

Also include responsive overrides for nav, footer, and CTA (same as landing page).

**Step 3: Verify and commit**

Run: `npm run check && npm run build`

```bash
git add src/routes/features/+page.svelte
git commit -m "feat: add responsive styles for features page"
```

---

### Task 9: Final Verification

**Step 1: Full build check**

Run: `npm run check && npm run build`
Expected: 0 errors, build succeeds

**Step 2: Visual checklist**

Verify in browser:
- [ ] Landing page features grid shows 11 items (including Rating Scheme and In-Processing)
- [ ] "See all features" link appears below the grid
- [ ] Roadmap shows "Recently Shipped" with 3 green-checked items
- [ ] Roadmap shows "Coming Next" with 3 future items
- [ ] Nav "Features" link goes to `/features`
- [ ] Footer "Features" link goes to `/features`
- [ ] `/features` page loads with header, 7 alternating sections, CTA, footer
- [ ] Each section has a demo panel on the opposite side from text
- [ ] Dark mode works on both pages
- [ ] Mobile/tablet layouts stack correctly

**Step 3: Commit any final fixes**

If needed, fix and commit.
