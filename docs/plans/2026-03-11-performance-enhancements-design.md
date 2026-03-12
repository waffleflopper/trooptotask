# Performance Enhancements Design

## Problem
Page-to-page navigation within the org feels slow. Every navigation triggers layout + page server load functions with multiple Supabase queries. No visual feedback during transitions.

## Enhancements

### 1. Navigation Progress Bar
Thin animated bar at the top during page transitions using SvelteKit's `navigating` store. Renders in org `+layout.svelte`. Gold accent color (#B8943E) to match existing brand.

### 2. Tier Query Cache
`getEffectiveTier()` runs on every layout load. Add in-memory TTL cache (5 min) keyed by orgId in `src/lib/server/subscription.ts`. Invalidate on billing mutations. When billing is disabled, already returns instantly (no change needed).

### 3. Parallelize Notification Count
The notification count query currently runs sequentially after the main `Promise.all` in `+layout.server.ts`. Move it into the main parallel batch.

### 4. Stream Non-Critical Page Data
For Dashboard and Onboarding pages, the sequential onboarding step progress fetch (fetch onboardings → then fetch steps) blocks rendering. Return the step-enriched onboardings as a streamed promise so the page shell renders immediately.

### 5. Preload Nav Links
Add `data-sveltekit-preload-data="hover"` explicitly on nav link `<a>` tags in TopHeader and BottomTabBar for clarity and consistency with app.html body-level setting.
