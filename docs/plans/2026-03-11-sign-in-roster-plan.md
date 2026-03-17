# Sign-In Roster Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a sign-in roster generator that creates printable PDF rosters for in-person training, with history, saved records, and signed scan uploads.

**Architecture:** Modal component on the training page with list/create views. API routes for CRUD + file upload. Print-to-window PDF generation. Supabase table for persistence, existing storage bucket for signed scans.

**Tech Stack:** SvelteKit, Svelte 5 runes, Supabase (Postgres + Storage), browser print API

---

### Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/20260311_sign_in_rosters.sql`

**Step 1: Write the migration**

```sql
-- Sign-In Rosters table
CREATE TABLE public.sign_in_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  roster_date date,
  blank_date boolean NOT NULL DEFAULT false,
  separate_by_group boolean NOT NULL DEFAULT false,
  sort_by text NOT NULL DEFAULT 'alphabetical' CHECK (sort_by IN ('alphabetical', 'rank')),
  personnel_snapshot jsonb NOT NULL,
  filter_config jsonb,
  signed_file_path text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for org-scoped queries ordered by date
CREATE INDEX idx_sign_in_rosters_org ON sign_in_rosters (organization_id, created_at DESC);

-- RLS
ALTER TABLE sign_in_rosters ENABLE ROW LEVEL SECURITY;

-- Read: org members with canViewTraining
CREATE POLICY "sign_in_rosters_select" ON sign_in_rosters FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = sign_in_rosters.organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_training = true)
  )
);

-- Insert: org members with canViewTraining
CREATE POLICY "sign_in_rosters_insert" ON sign_in_rosters FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = sign_in_rosters.organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_training = true)
  )
);

-- Update: org members with canEditTraining (for uploading signed scans)
CREATE POLICY "sign_in_rosters_update" ON sign_in_rosters FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = sign_in_rosters.organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_training = true)
  )
);

-- Delete: org members with canEditTraining
CREATE POLICY "sign_in_rosters_delete" ON sign_in_rosters FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = sign_in_rosters.organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_training = true)
  )
);
```

**Step 2: Apply migration to local database**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260311_sign_in_rosters.sql`
Expected: CREATE TABLE, CREATE INDEX, ALTER TABLE, CREATE POLICY x4

**Step 3: Commit**

```bash
git add supabase/migrations/20260311_sign_in_rosters.sql
git commit -m "feat: add sign_in_rosters table migration"
```

---

### Task 2: TypeScript Types

**Files:**

- Modify: `src/lib/types.ts` (add interface at end of file, near other interfaces)

**Step 1: Add the SignInRoster interface**

Add to `src/lib/types.ts`:

```typescript
export interface SignInRoster {
	id: string;
	title: string;
	rosterDate: string | null;
	blankDate: boolean;
	separateByGroup: boolean;
	sortBy: 'alphabetical' | 'rank';
	personnelSnapshot: { id: string; rank: string; lastName: string; firstName: string; group: string }[];
	filterConfig: { groups: string[]; ranks: string[] } | null;
	signedFilePath: string | null;
	createdBy: string;
	createdAt: string;
}
```

**Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add SignInRoster type interface"
```

---

### Task 3: API Routes — List & Create

**Files:**

- Create: `src/routes/org/[orgId]/api/sign-in-rosters/+server.ts`

**Step 1: Write the GET and POST handlers**

Follow the pattern from `src/routes/org/[orgId]/api/personnel/+server.ts`. Key points:

- Use `getApiContext` for supabase/userId
- Permission check: `requireViewPermission` for GET, `requireViewPermission` for POST (anyone who can view training can create)
- GET supports query params: `title` (search), `from`/`to` (date range), `limit` (default 20), `offset` (default 0)
- POST accepts the roster config, validates required fields, saves to DB

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { auditLog } from '$lib/server/auditLog';

export const GET: RequestHandler = async ({ params, url, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	const title = url.searchParams.get('title') || '';
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
	const offset = parseInt(url.searchParams.get('offset') || '0');

	let query = supabase
		.from('sign_in_rosters')
		.select('*', { count: 'exact' })
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	if (title) {
		query = query.ilike('title', `%${title}%`);
	}
	if (from) {
		query = query.gte('created_at', from);
	}
	if (to) {
		query = query.lte('created_at', to + 'T23:59:59.999Z');
	}

	const { data, error: dbError, count } = await query;

	if (dbError) throw error(500, dbError.message);

	const rosters = (data || []).map((r: any) => ({
		id: r.id,
		title: r.title,
		rosterDate: r.roster_date,
		blankDate: r.blank_date,
		separateByGroup: r.separate_by_group,
		sortBy: r.sort_by,
		personnelSnapshot: r.personnel_snapshot,
		filterConfig: r.filter_config,
		signedFilePath: r.signed_file_path,
		createdBy: r.created_by,
		createdAt: r.created_at
	}));

	return json({ rosters, total: count ?? 0 });
};

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	const body = await request.json();

	if (!body.title?.trim()) {
		return json({ error: 'Title is required' }, { status: 400 });
	}
	if (!body.personnelSnapshot?.length) {
		return json({ error: 'Personnel snapshot is required' }, { status: 400 });
	}

	const row = {
		organization_id: orgId,
		title: body.title.trim(),
		roster_date: body.rosterDate || null,
		blank_date: body.blankDate ?? false,
		separate_by_group: body.separateByGroup ?? false,
		sort_by: body.sortBy || 'alphabetical',
		personnel_snapshot: body.personnelSnapshot,
		filter_config: body.filterConfig || null,
		signed_file_path: null,
		created_by: userId
	};

	const { data, error: dbError } = await supabase.from('sign_in_rosters').insert(row).select().single();

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'sign_in_roster.created',
			resourceType: 'sign_in_roster',
			resourceId: data.id,
			orgId,
			details: { actor: locals.user?.email ?? userId, title: body.title }
		},
		{ userId }
	);

	return json({
		id: data.id,
		title: data.title,
		rosterDate: data.roster_date,
		blankDate: data.blank_date,
		separateByGroup: data.separate_by_group,
		sortBy: data.sort_by,
		personnelSnapshot: data.personnel_snapshot,
		filterConfig: data.filter_config,
		signedFilePath: data.signed_file_path,
		createdBy: data.created_by,
		createdAt: data.created_at
	});
};
```

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/api/sign-in-rosters/+server.ts
git commit -m "feat: add sign-in rosters list and create API endpoints"
```

---

### Task 4: API Routes — Delete, Upload, Remove Upload

**Files:**

- Create: `src/routes/org/[orgId]/api/sign-in-rosters/[id]/+server.ts`
- Create: `src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/+server.ts`

**Step 1: Write the DELETE handler for roster records**

`src/routes/org/[orgId]/api/sign-in-rosters/[id]/+server.ts`:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { auditLog } from '$lib/server/auditLog';

export const DELETE: RequestHandler = async ({ params, locals, cookies }) => {
	const { orgId, id } = params;
	const { supabase, userId } = getApiContext(locals, cookies, orgId);

	// Fetch the roster first to check for signed file
	const { data: roster } = await supabase
		.from('sign_in_rosters')
		.select('signed_file_path, title')
		.eq('id', id)
		.eq('organization_id', orgId)
		.single();

	if (!roster) throw error(404, 'Roster not found');

	// Delete signed file from storage if exists
	if (roster.signed_file_path) {
		await supabase.storage.from('counseling-files').remove([roster.signed_file_path]);
	}

	const { error: dbError } = await supabase.from('sign_in_rosters').delete().eq('id', id).eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'sign_in_roster.deleted',
			resourceType: 'sign_in_roster',
			resourceId: id,
			orgId,
			details: { actor: locals.user?.email ?? userId, title: roster.title }
		},
		{ userId }
	);

	return json({ success: true });
};
```

**Step 2: Write the upload/remove-upload handlers**

`src/routes/org/[orgId]/api/sign-in-rosters/[id]/upload/+server.ts`:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { auditLog } from '$lib/server/auditLog';

// Upload signed scan
export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId, id } = params;
	const { supabase, userId } = getApiContext(locals, cookies, orgId);

	const formData = await request.formData();
	const file = formData.get('file') as File;

	if (!file) return json({ error: 'No file provided' }, { status: 400 });
	if (file.size > 10 * 1024 * 1024) return json({ error: 'File must be under 10MB' }, { status: 400 });

	const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
	const storagePath = `${orgId}/sign-in-rosters/${id}/${sanitizedName}`;

	const { error: uploadError } = await supabase.storage
		.from('counseling-files')
		.upload(storagePath, file, { upsert: true });

	if (uploadError) throw error(500, uploadError.message);

	const { error: dbError } = await supabase
		.from('sign_in_rosters')
		.update({ signed_file_path: storagePath })
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{
			action: 'sign_in_roster.scan_uploaded',
			resourceType: 'sign_in_roster',
			resourceId: id,
			orgId,
			details: { actor: locals.user?.email ?? userId }
		},
		{ userId }
	);

	return json({ signedFilePath: storagePath });
};

// Remove signed scan
export const DELETE: RequestHandler = async ({ params, locals, cookies }) => {
	const { orgId, id } = params;
	const { supabase, userId } = getApiContext(locals, cookies, orgId);

	const { data: roster } = await supabase
		.from('sign_in_rosters')
		.select('signed_file_path')
		.eq('id', id)
		.eq('organization_id', orgId)
		.single();

	if (!roster) throw error(404, 'Roster not found');

	if (roster.signed_file_path) {
		await supabase.storage.from('counseling-files').remove([roster.signed_file_path]);
	}

	const { error: dbError } = await supabase
		.from('sign_in_rosters')
		.update({ signed_file_path: null })
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
```

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/api/sign-in-rosters/
git commit -m "feat: add sign-in roster delete and upload API endpoints"
```

---

### Task 5: SignInRosterModal Component — List View

**Files:**

- Create: `src/lib/components/SignInRosterModal.svelte`

This is the main modal component. Start with the list view (primary view when modal opens).

**Key details:**

- Uses `Modal.svelte` as wrapper
- Fetches rosters from API on mount via `$effect`
- Shows 20 most recent, with title search + date range filter
- Each row: title, date, personnel count, upload indicator
- "New Roster" button at top
- Click row to expand detail with actions (download PDF, upload scan, delete)
- Pagination via "Load more" button

**Props interface:**

```typescript
interface Props {
	orgId: string;
	personnel: Personnel[];
	groups: { id: string; name: string }[];
	canEdit: boolean; // canEditTraining — controls delete/upload actions
	onClose: () => void;
}
```

**State variables:**

```typescript
let rosters = $state<SignInRoster[]>([]);
let total = $state(0);
let loading = $state(true);
let searchTitle = $state('');
let dateFrom = $state('');
let dateTo = $state('');
let view = $state<'list' | 'create'>('list');
let expandedId = $state<string | null>(null);
```

**Fetching pattern:**

```typescript
async function fetchRosters(reset = false) {
	if (reset) {
		rosters = [];
	}
	loading = true;
	const offset = reset ? 0 : rosters.length;
	const params = new URLSearchParams({ limit: '20', offset: String(offset) });
	if (searchTitle) params.set('title', searchTitle);
	if (dateFrom) params.set('from', dateFrom);
	if (dateTo) params.set('to', dateTo);

	const res = await fetch(`/org/${orgId}/api/sign-in-rosters?${params}`);
	const data = await res.json();
	rosters = reset ? data.rosters : [...rosters, ...data.rosters];
	total = data.total;
	loading = false;
}
```

Build out the full list view UI with filter bar, roster rows, expanded detail actions, and load-more pagination. Use existing CSS classes (`.btn`, `.input`, `.form-row`, etc.) and shared components (`Spinner`, `EmptyState`).

For the expanded row detail actions:

- **Re-print**: call `generatePDF(roster)` (reuse from create view, Task 7)
- **Upload signed scan**: file input that POSTs to upload endpoint
- **Download signed scan**: fetch signed URL from Supabase storage, open in new tab
- **Delete**: confirm dialog, then DELETE to API, remove from local list

**Step 2: Commit**

```bash
git add src/lib/components/SignInRosterModal.svelte
git commit -m "feat: add SignInRosterModal list view component"
```

---

### Task 6: SignInRosterModal Component — Create View

**Files:**

- Modify: `src/lib/components/SignInRosterModal.svelte`

Add the create view within the same component (toggled by `view` state).

**Create view state:**

```typescript
let title = $state('');
let dateOption = $state<'specific' | 'blank'>('specific');
let rosterDate = $state(new Date().toISOString().split('T')[0]);
let separateByGroup = $state(false);
let sortBy = $state<'alphabetical' | 'rank'>('alphabetical');
let selectedRanks = $state<Set<string>>(new Set(ALL_RANKS));
let selectedGroups = $state<Set<string>>(new Set()); // empty = all groups
```

**Category quick-toggles logic:**

Reference `ARMY_RANKS` from `src/lib/types.ts` for category definitions:

- "All Officers": `ARMY_RANKS.officer`
- "All Warrant": `ARMY_RANKS.warrant`
- "All Enlisted": `ARMY_RANKS.enlisted` + `ARMY_RANKS.nco`
- "Civilians": `ARMY_RANKS.civilian`

```typescript
// Derived: is a category fully selected?
const allOfficersSelected = $derived(ARMY_RANKS.officer.every((r) => selectedRanks.has(r)));
const allWarrantSelected = $derived(ARMY_RANKS.warrant.every((r) => selectedRanks.has(r)));
const allEnlistedSelected = $derived([...ARMY_RANKS.enlisted, ...ARMY_RANKS.nco].every((r) => selectedRanks.has(r)));
const allCiviliansSelected = $derived(ARMY_RANKS.civilian.every((r) => selectedRanks.has(r)));

function toggleCategory(ranks: readonly string[]) {
	const allSelected = ranks.every((r) => selectedRanks.has(r));
	const next = new Set(selectedRanks);
	if (allSelected) {
		ranks.forEach((r) => next.delete(r));
	} else {
		ranks.forEach((r) => next.add(r));
	}
	selectedRanks = next;
}
```

**Personnel filtering (derived):**

```typescript
const filteredPersonnel = $derived.by(() => {
	return personnel.filter((p) => {
		if (!selectedRanks.has(p.rank)) return false;
		if (selectedGroups.size > 0 && !selectedGroups.has(p.groupName)) return false;
		return true;
	});
});
```

**Form layout:**

- Title input
- Date radio + date picker (or "Leave blank")
- Separate by group toggle
- Sort by radio
- Category quick-toggle buttons (styled like chips, highlighted when active)
- Individual rank chips below categories
- Group chips
- Personnel count preview: "X personnel will be included"
- Footer: Cancel (back to list) | Generate

**On Generate:**

1. Build personnel snapshot from `filteredPersonnel`
2. Sort snapshot according to `sortBy` (use `RANK_INDEX` from personnelGrouping.ts for rank sort)
3. If `separateByGroup`, group them using group names
4. Call `generatePDF()` (Task 7)
5. After print dialog, prompt "Save this roster?"
6. If yes, POST to API with snapshot + config
7. Return to list view, prepend new roster to list

**Step 2: Commit**

```bash
git add src/lib/components/SignInRosterModal.svelte
git commit -m "feat: add SignInRosterModal create view with filtering"
```

---

### Task 7: PDF Generation

**Files:**

- Modify: `src/lib/components/SignInRosterModal.svelte` (add `generatePDF` function)

**Pattern:** Follow existing print-to-window approach from calendar page.

```typescript
function generatePDF(config: {
	title: string;
	rosterDate: string | null;
	blankDate: boolean;
	separateByGroup: boolean;
	sortBy: string;
	personnelSnapshot: { rank: string; lastName: string; firstName: string; group: string }[];
}) {
	// Sort the snapshot
	let sorted = [...config.personnelSnapshot];
	if (config.sortBy === 'rank') {
		sorted.sort((a, b) => {
			const rankA = RANK_INDEX.get(a.rank) ?? RANK_ORDER.length;
			const rankB = RANK_INDEX.get(b.rank) ?? RANK_ORDER.length;
			if (rankA !== rankB) return rankA - rankB;
			const lastDiff = a.lastName.localeCompare(b.lastName);
			if (lastDiff !== 0) return lastDiff;
			return a.firstName.localeCompare(b.firstName);
		});
	} else {
		sorted.sort((a, b) => {
			const lastDiff = a.lastName.localeCompare(b.lastName);
			if (lastDiff !== 0) return lastDiff;
			return a.firstName.localeCompare(b.firstName);
		});
	}

	// Group if needed
	let groups: { name: string; people: typeof sorted }[];
	if (config.separateByGroup) {
		const map = new Map<string, typeof sorted>();
		for (const p of sorted) {
			const g = p.group || 'Unassigned';
			if (!map.has(g)) map.set(g, []);
			map.get(g)!.push(p);
		}
		groups = [...map.entries()].map(([name, people]) => ({ name, people }));
	} else {
		groups = [{ name: '', people: sorted }];
	}

	// Build date display
	const dateDisplay = config.blankDate
		? 'Date: _______________'
		: `Date: ${new Date(config.rosterDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;

	// Build HTML
	let rows = '';
	let rowNum = 0;
	for (const group of groups) {
		if (config.separateByGroup && group.name) {
			rows += `<tr class="group-header"><td colspan="4" style="font-weight:bold; font-size:14px; padding:10px 4px 4px; border:none;">${group.name}</td></tr>`;
		}
		for (const p of group.people) {
			rowNum++;
			rows += `<tr>
				<td style="width:30px; text-align:center; padding:6px 4px;">${rowNum}</td>
				<td style="width:60px; padding:6px 4px;">${p.rank}</td>
				<td style="width:200px; padding:6px 4px;">${p.lastName}, ${p.firstName}</td>
				<td style="padding:6px 4px; border-bottom:1px solid #000;">&nbsp;</td>
			</tr>`;
		}
	}

	const html = `<!DOCTYPE html>
<html>
<head>
<title>${config.title} - Sign-In Roster</title>
<style>
	@media print {
		@page { size: portrait; margin: 0.75in; }
		body { margin: 0; }
	}
	body { font-family: Arial, sans-serif; font-size: 12px; }
	h1 { text-align: center; font-size: 20px; margin-bottom: 4px; }
	.date { text-align: center; font-size: 14px; margin-bottom: 20px; }
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; padding: 6px 4px; border-bottom: 2px solid #000; font-size: 12px; }
	td { font-size: 12px; }
	.group-header td { background: none; }
	tr { page-break-inside: avoid; }
</style>
</head>
<body>
	<h1>${config.title}</h1>
	<div class="date">${dateDisplay}</div>
	<table>
		<thead>
			<tr>
				<th style="width:30px;">#</th>
				<th style="width:60px;">Rank</th>
				<th style="width:200px;">Name</th>
				<th>Signature</th>
			</tr>
		</thead>
		<tbody>${rows}</tbody>
	</table>
	<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

	const printWindow = window.open('', '_blank');
	if (printWindow) {
		printWindow.document.write(html);
		printWindow.document.close();
	}
}
```

**Key details:**

- Row numbering restarts per page conceptually but is sequential for simplicity
- Signature column has bottom border only (the signature line)
- Group headers span full width, no border
- `page-break-inside: avoid` on rows prevents splitting a row across pages
- Portrait orientation via `@page`

**Step 2: Commit**

```bash
git add src/lib/components/SignInRosterModal.svelte
git commit -m "feat: add PDF generation for sign-in rosters"
```

---

### Task 8: Wire Modal into Training Page

**Files:**

- Modify: `src/routes/org/[orgId]/training/+page.svelte` (add button + modal)

**Step 1: Add the button next to Reports**

In the `PageToolbar` section (around line 181-188), add a "Sign-In Rosters" button next to the Reports button:

```svelte
<button class="btn btn-sm" onclick={() => (showSignInRosters = true)}> Sign-In Rosters </button>
<button class="btn btn-sm" onclick={() => (showReports = true)}> Reports </button>
```

**Step 2: Add state and modal rendering**

At top of script:

```typescript
import SignInRosterModal from '$lib/components/SignInRosterModal.svelte';

let showSignInRosters = $state(false);
```

At bottom of template (alongside other modals):

```svelte
{#if showSignInRosters}
	<SignInRosterModal
		orgId={data.orgId}
		personnel={data.personnel}
		groups={data.groups}
		canEdit={data.permissions.canEditTraining}
		onClose={() => (showSignInRosters = false)}
	/>
{/if}
```

**Step 3: Also add to overflow menu items if the training page has one**

Check the `trainingOverflowItems` array (around lines 45-55) and add a "Sign-In Rosters" entry following the same pattern as Reports.

**Step 4: Commit**

```bash
git add src/routes/org/[orgId]/training/+page.svelte
git commit -m "feat: wire SignInRosterModal into training page toolbar"
```

---

### Task 9: Integration Testing & Polish

**Files:**

- Modify: `src/lib/components/SignInRosterModal.svelte` (bug fixes, UX polish)

**Step 1: Manual test checklist**

Run the dev server: `npm run dev`

Test the following:

- [ ] "Sign-In Rosters" button appears on training page
- [ ] Modal opens to empty list view with "No sign-in rosters yet" empty state
- [ ] "New Roster" button switches to create view
- [ ] Title input is required — generate button disabled without it
- [ ] Date toggle works: specific date shows picker, blank shows preview of blank line
- [ ] Category quick-toggles select/deselect rank chips correctly
- [ ] Deselecting one rank within a category un-highlights the category toggle
- [ ] Group chips filter personnel
- [ ] Personnel count updates as filters change
- [ ] Generate opens print dialog in new window with correct layout
- [ ] After closing print window, save prompt appears
- [ ] Saving creates roster and it appears in the list
- [ ] List row shows title, date, personnel count
- [ ] Clicking row expands to show actions
- [ ] Re-print generates same PDF from snapshot
- [ ] Upload signed scan works (PDF file)
- [ ] Upload indicator appears after upload
- [ ] Download signed scan opens in new tab
- [ ] Remove signed scan works
- [ ] Delete roster removes from list (with confirm)
- [ ] Search by title filters the list
- [ ] Date range filter works
- [ ] "Load more" pagination works when >20 rosters exist
- [ ] Permissions: non-edit users can view/create but not delete/upload

**Step 2: Fix any issues found**

**Step 3: Run build check**

Run: `npm run check && npm run build`
Expected: No new type errors (pre-existing ones are acceptable per CLAUDE.md)

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: sign-in roster polish and bug fixes"
```

---

### Task 10: Changelog Update

**Files:**

- Modify: `src/lib/data/changelog.ts`

**Step 1: Add changelog entry**

Add an entry describing the new feature in plain language:

```typescript
{
	date: '2026-03-11',
	title: 'Sign-In Rosters',
	description: 'You can now generate printable sign-in rosters for training events. Filter by rank and group, sort alphabetically or by rank, and save rosters for your records. You can even upload the signed copy afterward so you always have proof of attendance on file.'
}
```

**Step 2: Trim old entries if more than ~5**

**Step 3: Commit**

```bash
git add src/lib/data/changelog.ts
git commit -m "docs: add sign-in roster feature to changelog"
```
