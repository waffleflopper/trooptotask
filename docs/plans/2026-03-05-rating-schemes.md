# OER/NCOER Rating Scheme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a rating scheme feature under the Personnel page that lets leaders maintain OER/NCOER/WOER rating chains and track evaluation due dates with color-coded warnings.

**Architecture:** New `rating_scheme_entries` table in Supabase, a Svelte 5 rune-based store with optimistic updates, a SvelteKit API route for CRUD, a TypeScript interface and utility for eval-type derivation from rank, and two UI views (grouped hierarchy + flat table) toggled within the Personnel page's new "Rating Scheme" sub-view.

**Tech Stack:** SvelteKit 2.5, Svelte 5 runes, Supabase (Postgres + RLS), TypeScript, pure CSS variables

---

### Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/20260305_rating_scheme.sql`

**Step 1: Write the migration**

```sql
-- Rating scheme entries: tracks who rates whom and evaluation timelines
create table public.rating_scheme_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rated_person_id uuid not null references public.personnel(id) on delete cascade,
  eval_type text not null check (eval_type in ('OER', 'NCOER', 'WOER')),
  rater_person_id uuid references public.personnel(id) on delete set null,
  rater_name text,
  senior_rater_person_id uuid references public.personnel(id) on delete set null,
  senior_rater_name text,
  intermediate_rater_person_id uuid references public.personnel(id) on delete set null,
  intermediate_rater_name text,
  reviewer_person_id uuid references public.personnel(id) on delete set null,
  reviewer_name text,
  rating_period_start date not null,
  rating_period_end date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'change-of-rater')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rating_scheme_entries_org_idx on public.rating_scheme_entries(organization_id);
create index rating_scheme_entries_rated_idx on public.rating_scheme_entries(rated_person_id);

-- Updated_at trigger
create trigger set_updated_at
  before update on public.rating_scheme_entries
  for each row execute function public.set_updated_at();

-- RLS
alter table public.rating_scheme_entries enable row level security;

create policy "Org members can view rating scheme"
  on public.rating_scheme_entries for select
  using (public.can_view_personnel(organization_id));

create policy "Org editors can manage rating scheme"
  on public.rating_scheme_entries for all
  using (public.can_edit_personnel(organization_id));
```

**Step 2: Apply migration locally**

Run: `npx supabase db push` or apply via Supabase dashboard.

**Step 3: Commit**

```bash
git add supabase/migrations/20260305_rating_scheme.sql
git commit -m "feat(rating): add rating_scheme_entries table with RLS"
```

---

### Task 2: TypeScript Types & Utilities

**Files:**

- Modify: `src/lib/types.ts`
- Create: `src/lib/utils/ratingScheme.ts`

**Step 1: Add the RatingSchemeEntry interface and eval type utility to types.ts**

Add at the end of `src/lib/types.ts`:

```typescript
export interface RatingSchemeEntry {
	id: string;
	ratedPersonId: string;
	evalType: 'OER' | 'NCOER' | 'WOER';
	raterPersonId: string | null;
	raterName: string | null;
	seniorRaterPersonId: string | null;
	seniorRaterName: string | null;
	intermediateRaterPersonId: string | null;
	intermediateRaterName: string | null;
	reviewerPersonId: string | null;
	reviewerName: string | null;
	ratingPeriodStart: string;
	ratingPeriodEnd: string;
	status: 'active' | 'completed' | 'change-of-rater';
	notes: string | null;
}

export type RatingDueStatus = 'current' | 'due-60' | 'due-30' | 'overdue' | 'completed';

export const RATING_STATUS_COLORS: Record<RatingDueStatus, string> = {
	current: '#22c55e',
	'due-60': '#eab308',
	'due-30': '#f97316',
	overdue: '#ef4444',
	completed: '#6b7280'
};
```

**Step 2: Create the rating scheme utility file**

Create `src/lib/utils/ratingScheme.ts`:

```typescript
import { ARMY_RANKS } from '../types';
import type { RatingDueStatus } from '../types';

export function getEvalTypeForRank(rank: string): 'OER' | 'NCOER' | 'WOER' {
	if ((ARMY_RANKS.officer as readonly string[]).includes(rank)) return 'OER';
	if ((ARMY_RANKS.warrant as readonly string[]).includes(rank)) return 'WOER';
	return 'NCOER';
}

export function getRatingDueStatus(ratingPeriodEnd: string, status: string, today: Date = new Date()): RatingDueStatus {
	if (status === 'completed') return 'completed';

	const end = new Date(ratingPeriodEnd + 'T00:00:00');
	const diffMs = end.getTime() - today.getTime();
	const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays < 0) return 'overdue';
	if (diffDays <= 30) return 'due-30';
	if (diffDays <= 60) return 'due-60';
	return 'current';
}

export function getDaysUntilDue(ratingPeriodEnd: string, today: Date = new Date()): number {
	const end = new Date(ratingPeriodEnd + 'T00:00:00');
	const diffMs = end.getTime() - today.getTime();
	return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
```

**Step 3: Commit**

```bash
git add src/lib/types.ts src/lib/utils/ratingScheme.ts
git commit -m "feat(rating): add RatingSchemeEntry type and due-status utilities"
```

---

### Task 3: Rating Scheme Store

**Files:**

- Create: `src/lib/stores/ratingScheme.svelte.ts`

**Step 1: Create the store**

Follow the same pattern as `personnelStore` — class with private `$state`, optimistic updates, fetch to API.

```typescript
import type { RatingSchemeEntry } from '../types';

class RatingSchemeStore {
	#entries = $state<RatingSchemeEntry[]>([]);
	#orgId = '';

	get list() {
		return this.#entries;
	}

	load(entries: RatingSchemeEntry[], orgId: string) {
		this.#entries = entries;
		this.#orgId = orgId;
	}

	async add(data: Omit<RatingSchemeEntry, 'id'>): Promise<RatingSchemeEntry | null> {
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimistic: RatingSchemeEntry = { id: tempId, ...data };
		this.#entries = [...this.#entries, optimistic];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/rating-scheme`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add rating scheme entry');
			const created = await res.json();
			this.#entries = this.#entries.map((e) => (e.id === tempId ? created : e));
			return created;
		} catch {
			this.#entries = this.#entries.filter((e) => e.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<RatingSchemeEntry, 'id'>>): Promise<boolean> {
		const original = this.#entries.find((e) => e.id === id);
		if (!original) return false;

		this.#entries = this.#entries.map((e) => (e.id === id ? { ...e, ...data } : e));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/rating-scheme`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update rating scheme entry');
			const updated = await res.json();
			this.#entries = this.#entries.map((e) => (e.id === id ? updated : e));
			return true;
		} catch {
			this.#entries = this.#entries.map((e) => (e.id === id ? original : e));
			return false;
		}
	}

	async remove(id: string): Promise<boolean> {
		const original = this.#entries.find((e) => e.id === id);
		if (!original) return false;

		this.#entries = this.#entries.filter((e) => e.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/rating-scheme`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete rating scheme entry');
			return true;
		} catch {
			this.#entries = [...this.#entries, original];
			return false;
		}
	}
}

export const ratingSchemeStore = new RatingSchemeStore();
```

**Step 2: Commit**

```bash
git add src/lib/stores/ratingScheme.svelte.ts
git commit -m "feat(rating): add rating scheme store with optimistic updates"
```

---

### Task 4: API Route

**Files:**

- Create: `src/routes/org/[orgId]/api/rating-scheme/+server.ts`

**Step 1: Create the CRUD API route**

Follow the pattern from `src/routes/org/[orgId]/api/personnel/+server.ts`.

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';

function toClient(row: any) {
	return {
		id: row.id,
		ratedPersonId: row.rated_person_id,
		evalType: row.eval_type,
		raterPersonId: row.rater_person_id,
		raterName: row.rater_name,
		seniorRaterPersonId: row.senior_rater_person_id,
		seniorRaterName: row.senior_rater_name,
		intermediateRaterPersonId: row.intermediate_rater_person_id,
		intermediateRaterName: row.intermediate_rater_name,
		reviewerPersonId: row.reviewer_person_id,
		reviewerName: row.reviewer_name,
		ratingPeriodStart: row.rating_period_start,
		ratingPeriodEnd: row.rating_period_end,
		status: row.status,
		notes: row.notes
	};
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();

	const row = {
		organization_id: orgId,
		rated_person_id: body.ratedPersonId,
		eval_type: body.evalType,
		rater_person_id: body.raterPersonId || null,
		rater_name: body.raterName || null,
		senior_rater_person_id: body.seniorRaterPersonId || null,
		senior_rater_name: body.seniorRaterName || null,
		intermediate_rater_person_id: body.intermediateRaterPersonId || null,
		intermediate_rater_name: body.intermediateRaterName || null,
		reviewer_person_id: body.reviewerPersonId || null,
		reviewer_name: body.reviewerName || null,
		rating_period_start: body.ratingPeriodStart,
		rating_period_end: body.ratingPeriodEnd,
		status: body.status || 'active',
		notes: body.notes || null
	};

	const { data, error: dbError } = await supabase.from('rating_scheme_entries').insert(row).select().single();

	if (dbError) throw error(500, dbError.message);

	return json(toClient(data));
};

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	const updates: Record<string, unknown> = {};
	if (fields.ratedPersonId !== undefined) updates.rated_person_id = fields.ratedPersonId;
	if (fields.evalType !== undefined) updates.eval_type = fields.evalType;
	if (fields.raterPersonId !== undefined) updates.rater_person_id = fields.raterPersonId || null;
	if (fields.raterName !== undefined) updates.rater_name = fields.raterName || null;
	if (fields.seniorRaterPersonId !== undefined) updates.senior_rater_person_id = fields.seniorRaterPersonId || null;
	if (fields.seniorRaterName !== undefined) updates.senior_rater_name = fields.seniorRaterName || null;
	if (fields.intermediateRaterPersonId !== undefined)
		updates.intermediate_rater_person_id = fields.intermediateRaterPersonId || null;
	if (fields.intermediateRaterName !== undefined)
		updates.intermediate_rater_name = fields.intermediateRaterName || null;
	if (fields.reviewerPersonId !== undefined) updates.reviewer_person_id = fields.reviewerPersonId || null;
	if (fields.reviewerName !== undefined) updates.reviewer_name = fields.reviewerName || null;
	if (fields.ratingPeriodStart !== undefined) updates.rating_period_start = fields.ratingPeriodStart;
	if (fields.ratingPeriodEnd !== undefined) updates.rating_period_end = fields.ratingPeriodEnd;
	if (fields.status !== undefined) updates.status = fields.status;
	if (fields.notes !== undefined) updates.notes = fields.notes || null;

	const { data, error: dbError } = await supabase
		.from('rating_scheme_entries')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json(toClient(data));
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await supabase
		.from('rating_scheme_entries')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
```

**Step 2: Commit**

```bash
git add "src/routes/org/[orgId]/api/rating-scheme/+server.ts"
git commit -m "feat(rating): add rating scheme CRUD API route"
```

---

### Task 5: Load Rating Scheme Data in Personnel Page

**Files:**

- Modify: `src/routes/org/[orgId]/personnel/+page.server.ts`
- Modify: `src/routes/org/[orgId]/personnel/+page.svelte` (import and load store)

**Step 1: Add rating scheme query to page server load**

In `src/routes/org/[orgId]/personnel/+page.server.ts`, add to the `Promise.all()`:

```typescript
supabase.from('rating_scheme_entries').select('*').eq('organization_id', orgId).order('rating_period_end');
```

Add the import and transform the data:

```typescript
import type { RatingSchemeEntry } from '$lib/types';
```

Map the results (same pattern as personnel):

```typescript
const ratingSchemeEntries: RatingSchemeEntry[] = (ratingSchemeRes.data ?? []).map((r: any) => ({
	id: r.id,
	ratedPersonId: r.rated_person_id,
	evalType: r.eval_type,
	raterPersonId: r.rater_person_id,
	raterName: r.rater_name,
	seniorRaterPersonId: r.senior_rater_person_id,
	seniorRaterName: r.senior_rater_name,
	intermediateRaterPersonId: r.intermediate_rater_person_id,
	intermediateRaterName: r.intermediate_rater_name,
	reviewerPersonId: r.reviewer_person_id,
	reviewerName: r.reviewer_name,
	ratingPeriodStart: r.rating_period_start,
	ratingPeriodEnd: r.rating_period_end,
	status: r.status,
	notes: r.notes
}));
```

Return `ratingSchemeEntries` from the load function.

**Step 2: Load the store in the personnel page component**

In `src/routes/org/[orgId]/personnel/+page.svelte`, add:

```typescript
import { ratingSchemeStore } from '$lib/stores/ratingScheme.svelte';
```

Inside the existing `$effect()` block:

```typescript
ratingSchemeStore.load(data.ratingSchemeEntries, data.orgId);
```

**Step 3: Commit**

```bash
git add "src/routes/org/[orgId]/personnel/+page.server.ts" "src/routes/org/[orgId]/personnel/+page.svelte"
git commit -m "feat(rating): load rating scheme data in personnel page"
```

---

### Task 6: RatingSchemeEntryModal Component

**Files:**

- Create: `src/lib/components/RatingSchemeEntryModal.svelte`

**Step 1: Create the add/edit modal**

This modal lets users create or edit a rating scheme entry. It needs:

- Rated person selector (dropdown of all org personnel)
- Eval type selector (auto-suggested from rated person's rank)
- Rater section: toggle between internal (personnel dropdown) / external (freetext)
- Senior rater section: same toggle pattern
- Intermediate rater section (collapsed by default, expandable)
- Reviewer section (collapsed by default, expandable)
- Rating period start + end date inputs
- Status dropdown (Active / Completed / Change of Rater)
- Notes textarea
- Footer: [Delete] [spacer] [Cancel] [Save]

```svelte
<script lang="ts">
	import type { Personnel, RatingSchemeEntry } from '$lib/types';
	import { getEvalTypeForRank } from '$lib/utils/ratingScheme';
	import Modal from './Modal.svelte';
	import Spinner from './ui/Spinner.svelte';

	interface Props {
		entry: RatingSchemeEntry | null;
		personnel: Personnel[];
		onSave: (data: Omit<RatingSchemeEntry, 'id'>) => Promise<void>;
		onDelete?: (id: string) => Promise<void>;
		onClose: () => void;
	}

	let { entry, personnel, onSave, onDelete, onClose }: Props = $props();

	const sortedPersonnel = $derived(
		[...personnel].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
	);

	// Form state
	let ratedPersonId = $state(entry?.ratedPersonId ?? '');
	let evalType = $state<'OER' | 'NCOER' | 'WOER'>(entry?.evalType ?? 'NCOER');
	let raterMode = $state<'internal' | 'external'>(
		entry?.raterPersonId ? 'internal' : entry?.raterName ? 'external' : 'internal'
	);
	let raterPersonId = $state(entry?.raterPersonId ?? '');
	let raterName = $state(entry?.raterName ?? '');
	let srMode = $state<'internal' | 'external'>(
		entry?.seniorRaterPersonId ? 'internal' : entry?.seniorRaterName ? 'external' : 'internal'
	);
	let seniorRaterPersonId = $state(entry?.seniorRaterPersonId ?? '');
	let seniorRaterName = $state(entry?.seniorRaterName ?? '');
	let showIntermediate = $state(!!(entry?.intermediateRaterPersonId || entry?.intermediateRaterName));
	let irMode = $state<'internal' | 'external'>(entry?.intermediateRaterPersonId ? 'internal' : 'internal');
	let intermediateRaterPersonId = $state(entry?.intermediateRaterPersonId ?? '');
	let intermediateRaterName = $state(entry?.intermediateRaterName ?? '');
	let showReviewer = $state(!!(entry?.reviewerPersonId || entry?.reviewerName));
	let rvMode = $state<'internal' | 'external'>(entry?.reviewerPersonId ? 'internal' : 'internal');
	let reviewerPersonId = $state(entry?.reviewerPersonId ?? '');
	let reviewerName = $state(entry?.reviewerName ?? '');
	let ratingPeriodStart = $state(entry?.ratingPeriodStart ?? '');
	let ratingPeriodEnd = $state(entry?.ratingPeriodEnd ?? '');
	let status = $state(entry?.status ?? 'active');
	let notes = $state(entry?.notes ?? '');
	let saving = $state(false);
	let showDeleteConfirm = $state(false);

	// Auto-suggest eval type when rated person changes
	$effect(() => {
		if (!entry && ratedPersonId) {
			const person = personnel.find((p) => p.id === ratedPersonId);
			if (person) {
				evalType = getEvalTypeForRank(person.rank);
			}
		}
	});

	const canSave = $derived(
		!!ratedPersonId &&
			!!ratingPeriodStart &&
			!!ratingPeriodEnd &&
			(raterMode === 'internal' ? !!raterPersonId : !!raterName.trim()) &&
			(srMode === 'internal' ? !!seniorRaterPersonId : !!seniorRaterName.trim())
	);

	async function handleSave() {
		if (!canSave || saving) return;
		saving = true;
		try {
			await onSave({
				ratedPersonId,
				evalType,
				raterPersonId: raterMode === 'internal' ? raterPersonId || null : null,
				raterName: raterMode === 'external' ? raterName.trim() || null : null,
				seniorRaterPersonId: srMode === 'internal' ? seniorRaterPersonId || null : null,
				seniorRaterName: srMode === 'external' ? seniorRaterName.trim() || null : null,
				intermediateRaterPersonId: showIntermediate && irMode === 'internal' ? intermediateRaterPersonId || null : null,
				intermediateRaterName: showIntermediate && irMode === 'external' ? intermediateRaterName.trim() || null : null,
				reviewerPersonId: showReviewer && rvMode === 'internal' ? reviewerPersonId || null : null,
				reviewerName: showReviewer && rvMode === 'external' ? reviewerName.trim() || null : null,
				ratingPeriodStart,
				ratingPeriodEnd,
				status,
				notes: notes.trim() || null
			});
			onClose();
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!entry || !onDelete || saving) return;
		saving = true;
		try {
			await onDelete(entry.id);
			onClose();
		} finally {
			saving = false;
		}
	}

	function formatPersonLabel(p: Personnel): string {
		return `${p.rank} ${p.lastName}, ${p.firstName}`;
	}
</script>

<Modal title={entry ? 'Edit Rating Entry' : 'Add Rating Entry'} {onClose} width="550px" titleId="rating-entry-title">
	<div class="form-group">
		<label class="label" for="rated-person">Rated Individual</label>
		<select id="rated-person" class="select" bind:value={ratedPersonId} disabled={!!entry}>
			<option value="">Select a person...</option>
			{#each sortedPersonnel as p (p.id)}
				<option value={p.id}>{formatPersonLabel(p)}</option>
			{/each}
		</select>
	</div>

	<div class="form-group">
		<label class="label" for="eval-type">Evaluation Type</label>
		<select id="eval-type" class="select" bind:value={evalType}>
			<option value="OER">OER (Officer)</option>
			<option value="NCOER">NCOER (NCO)</option>
			<option value="WOER">WOER (Warrant Officer)</option>
		</select>
	</div>

	<fieldset class="rater-section">
		<legend class="section-legend">Rater <span class="required">*</span></legend>
		<div class="mode-toggle">
			<button class="toggle-btn" class:active={raterMode === 'internal'} onclick={() => (raterMode = 'internal')}
				>From Org</button
			>
			<button class="toggle-btn" class:active={raterMode === 'external'} onclick={() => (raterMode = 'external')}
				>External</button
			>
		</div>
		{#if raterMode === 'internal'}
			<select class="select" bind:value={raterPersonId}>
				<option value="">Select rater...</option>
				{#each sortedPersonnel as p (p.id)}
					<option value={p.id}>{formatPersonLabel(p)}</option>
				{/each}
			</select>
		{:else}
			<input
				class="input"
				type="text"
				bind:value={raterName}
				placeholder="Rank, Name, Position (e.g., MAJ Smith, S3)"
			/>
		{/if}
	</fieldset>

	<fieldset class="rater-section">
		<legend class="section-legend">Senior Rater <span class="required">*</span></legend>
		<div class="mode-toggle">
			<button class="toggle-btn" class:active={srMode === 'internal'} onclick={() => (srMode = 'internal')}
				>From Org</button
			>
			<button class="toggle-btn" class:active={srMode === 'external'} onclick={() => (srMode = 'external')}
				>External</button
			>
		</div>
		{#if srMode === 'internal'}
			<select class="select" bind:value={seniorRaterPersonId}>
				<option value="">Select senior rater...</option>
				{#each sortedPersonnel as p (p.id)}
					<option value={p.id}>{formatPersonLabel(p)}</option>
				{/each}
			</select>
		{:else}
			<input
				class="input"
				type="text"
				bind:value={seniorRaterName}
				placeholder="Rank, Name, Position (e.g., COL Jones, BDE CDR)"
			/>
		{/if}
	</fieldset>

	{#if !showIntermediate}
		<button class="btn-link" onclick={() => (showIntermediate = true)}>+ Add Intermediate Rater</button>
	{:else}
		<fieldset class="rater-section">
			<legend class="section-legend">
				Intermediate Rater
				<button
					class="btn-remove-section"
					onclick={() => {
						showIntermediate = false;
						intermediateRaterPersonId = '';
						intermediateRaterName = '';
					}}>Remove</button
				>
			</legend>
			<div class="mode-toggle">
				<button class="toggle-btn" class:active={irMode === 'internal'} onclick={() => (irMode = 'internal')}
					>From Org</button
				>
				<button class="toggle-btn" class:active={irMode === 'external'} onclick={() => (irMode = 'external')}
					>External</button
				>
			</div>
			{#if irMode === 'internal'}
				<select class="select" bind:value={intermediateRaterPersonId}>
					<option value="">Select intermediate rater...</option>
					{#each sortedPersonnel as p (p.id)}
						<option value={p.id}>{formatPersonLabel(p)}</option>
					{/each}
				</select>
			{:else}
				<input class="input" type="text" bind:value={intermediateRaterName} placeholder="Rank, Name, Position" />
			{/if}
		</fieldset>
	{/if}

	{#if !showReviewer}
		<button class="btn-link" onclick={() => (showReviewer = true)}>+ Add Reviewer</button>
	{:else}
		<fieldset class="rater-section">
			<legend class="section-legend">
				Reviewer
				<button
					class="btn-remove-section"
					onclick={() => {
						showReviewer = false;
						reviewerPersonId = '';
						reviewerName = '';
					}}>Remove</button
				>
			</legend>
			<div class="mode-toggle">
				<button class="toggle-btn" class:active={rvMode === 'internal'} onclick={() => (rvMode = 'internal')}
					>From Org</button
				>
				<button class="toggle-btn" class:active={rvMode === 'external'} onclick={() => (rvMode = 'external')}
					>External</button
				>
			</div>
			{#if rvMode === 'internal'}
				<select class="select" bind:value={reviewerPersonId}>
					<option value="">Select reviewer...</option>
					{#each sortedPersonnel as p (p.id)}
						<option value={p.id}>{formatPersonLabel(p)}</option>
					{/each}
				</select>
			{:else}
				<input class="input" type="text" bind:value={reviewerName} placeholder="Rank, Name, Position" />
			{/if}
		</fieldset>
	{/if}

	<div class="form-row">
		<div class="form-group">
			<label class="label" for="period-start">Rating Period Start</label>
			<input id="period-start" type="date" class="input" bind:value={ratingPeriodStart} />
		</div>
		<div class="form-group">
			<label class="label" for="period-end">Thru Date (Due)</label>
			<input id="period-end" type="date" class="input" bind:value={ratingPeriodEnd} />
		</div>
	</div>

	<div class="form-group">
		<label class="label" for="entry-status">Status</label>
		<select id="entry-status" class="select" bind:value={status}>
			<option value="active">Active</option>
			<option value="completed">Completed</option>
			<option value="change-of-rater">Change of Rater</option>
		</select>
	</div>

	<div class="form-group">
		<label class="label" for="entry-notes">Notes</label>
		<textarea id="entry-notes" class="input" rows="2" bind:value={notes} placeholder="Optional notes..."></textarea>
	</div>

	{#snippet footer()}
		{#if entry && onDelete}
			{#if showDeleteConfirm}
				<span class="delete-confirm-text">Delete this entry?</span>
				<button class="btn btn-danger btn-sm" onclick={handleDelete} disabled={saving}>Yes, Delete</button>
				<button class="btn btn-secondary btn-sm" onclick={() => (showDeleteConfirm = false)}>No</button>
			{:else}
				<button class="btn btn-danger" onclick={() => (showDeleteConfirm = true)}>Delete</button>
			{/if}
		{/if}
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" disabled={!canSave || saving} onclick={handleSave}>
			{#if saving}<Spinner />{/if}
			{saving ? 'Saving...' : 'Save'}
		</button>
	{/snippet}
</Modal>

<style>
	.rater-section {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.section-legend {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.required {
		color: var(--color-error);
	}

	.mode-toggle {
		display: flex;
		gap: 0;
		margin-bottom: var(--spacing-sm);
	}

	.toggle-btn {
		flex: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-xs);
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.15s;
	}

	.toggle-btn:first-child {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}

	.toggle-btn:last-child {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		border-left: none;
	}

	.toggle-btn.active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.btn-link {
		background: none;
		border: none;
		color: var(--color-primary);
		font-size: var(--font-size-sm);
		cursor: pointer;
		padding: var(--spacing-xs) 0;
		margin-bottom: var(--spacing-md);
	}

	.btn-link:hover {
		text-decoration: underline;
	}

	.btn-remove-section {
		background: none;
		border: none;
		color: var(--color-error);
		font-size: var(--font-size-xs);
		cursor: pointer;
		margin-left: auto;
	}

	.btn-remove-section:hover {
		text-decoration: underline;
	}

	.delete-confirm-text {
		font-size: var(--font-size-sm);
		color: var(--color-error);
	}
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/RatingSchemeEntryModal.svelte
git commit -m "feat(rating): add RatingSchemeEntryModal component"
```

---

### Task 7: RatingSchemeView Component — Table View

**Files:**

- Create: `src/lib/components/RatingSchemeTableView.svelte`

**Step 1: Create the flat table view**

This shows all rating scheme entries in a sortable table. Rows are clickable to edit.

```svelte
<script lang="ts">
	import type { Personnel, RatingSchemeEntry, RatingDueStatus } from '$lib/types';
	import { RATING_STATUS_COLORS } from '$lib/types';
	import { getRatingDueStatus, getDaysUntilDue } from '$lib/utils/ratingScheme';
	import Badge from './ui/Badge.svelte';
	import EmptyState from './ui/EmptyState.svelte';

	interface Props {
		entries: RatingSchemeEntry[];
		personnel: Personnel[];
		onEdit: (entry: RatingSchemeEntry) => void;
	}

	let { entries, personnel, onEdit }: Props = $props();

	function getPersonName(id: string | null, name: string | null): string {
		if (id) {
			const p = personnel.find((p) => p.id === id);
			return p ? `${p.rank} ${p.lastName}` : 'Unknown';
		}
		return name ?? '—';
	}

	function getRatedPerson(id: string): Personnel | undefined {
		return personnel.find((p) => p.id === id);
	}

	function formatDueStatus(entry: RatingSchemeEntry): { label: string; color: string } {
		const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
		const days = getDaysUntilDue(entry.ratingPeriodEnd);
		const color = RATING_STATUS_COLORS[status];

		if (status === 'completed') return { label: 'Completed', color };
		if (status === 'overdue') return { label: `Overdue (${Math.abs(days)}d)`, color };
		if (status === 'due-30') return { label: `${days}d`, color };
		if (status === 'due-60') return { label: `${days}d`, color };
		return { label: 'Current', color };
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' });
	}
</script>

{#if entries.length === 0}
	<EmptyState message="No rating scheme entries yet. Click 'Add Entry' to get started." />
{:else}
	<div class="table-wrapper">
		<table class="rating-table">
			<thead>
				<tr>
					<th>Type</th>
					<th>Rated Individual</th>
					<th>Rater</th>
					<th>Senior Rater</th>
					<th>Thru Date</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{#each entries as entry (entry.id)}
					{@const rated = getRatedPerson(entry.ratedPersonId)}
					{@const due = formatDueStatus(entry)}
					<tr class="clickable" onclick={() => onEdit(entry)}>
						<td
							><Badge
								label={entry.evalType}
								color={entry.evalType === 'OER' ? '#3b82f6' : entry.evalType === 'WOER' ? '#8b5cf6' : '#059669'}
							/></td
						>
						<td class="person-cell">
							{#if rated}
								<span class="rank">{rated.rank}</span> {rated.lastName}, {rated.firstName}
							{:else}
								<span class="unknown">Unknown</span>
							{/if}
						</td>
						<td class="rater-cell">{getPersonName(entry.raterPersonId, entry.raterName)}</td>
						<td class="rater-cell">{getPersonName(entry.seniorRaterPersonId, entry.seniorRaterName)}</td>
						<td>{formatDate(entry.ratingPeriodEnd)}</td>
						<td><Badge label={due.label} color={due.color} /></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.table-wrapper {
		overflow-x: auto;
	}

	.rating-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.rating-table th {
		text-align: left;
		padding: var(--spacing-sm) var(--spacing-md);
		font-weight: 600;
		color: var(--color-text-secondary);
		border-bottom: 2px solid var(--color-border);
		white-space: nowrap;
	}

	.rating-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
		color: var(--color-text);
	}

	tr.clickable {
		cursor: pointer;
		transition: background 0.1s;
	}

	tr.clickable:hover {
		background: var(--color-surface-variant);
	}

	.rank {
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.rater-cell {
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.unknown {
		color: var(--color-text-muted);
		font-style: italic;
	}
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/RatingSchemeTableView.svelte
git commit -m "feat(rating): add RatingSchemeTableView component"
```

---

### Task 8: RatingSchemeView Component — Grouped View

**Files:**

- Create: `src/lib/components/RatingSchemeGroupedView.svelte`

**Step 1: Create the grouped hierarchy view**

Groups entries by senior rater, then sub-groups by rater. Shows the chain visually.

```svelte
<script lang="ts">
	import type { Personnel, RatingSchemeEntry } from '$lib/types';
	import { RATING_STATUS_COLORS } from '$lib/types';
	import { getRatingDueStatus, getDaysUntilDue } from '$lib/utils/ratingScheme';
	import Badge from './ui/Badge.svelte';
	import EmptyState from './ui/EmptyState.svelte';

	interface Props {
		entries: RatingSchemeEntry[];
		personnel: Personnel[];
		onEdit: (entry: RatingSchemeEntry) => void;
	}

	let { entries, personnel, onEdit }: Props = $props();

	function getPersonDisplay(id: string | null, name: string | null): string {
		if (id) {
			const p = personnel.find((p) => p.id === id);
			return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
		}
		return name ?? 'Not Set';
	}

	function getSeniorRaterKey(entry: RatingSchemeEntry): string {
		return entry.seniorRaterPersonId || entry.seniorRaterName || 'unassigned';
	}

	function getRaterKey(entry: RatingSchemeEntry): string {
		return entry.raterPersonId || entry.raterName || 'unassigned';
	}

	interface GroupedScheme {
		seniorRaterLabel: string;
		raterGroups: {
			raterLabel: string;
			entries: RatingSchemeEntry[];
		}[];
	}

	const grouped = $derived.by<GroupedScheme[]>(() => {
		const srMap = new Map<string, Map<string, RatingSchemeEntry[]>>();

		for (const entry of entries) {
			const srKey = getSeniorRaterKey(entry);
			if (!srMap.has(srKey)) srMap.set(srKey, new Map());
			const raterMap = srMap.get(srKey)!;
			const rKey = getRaterKey(entry);
			if (!raterMap.has(rKey)) raterMap.set(rKey, []);
			raterMap.get(rKey)!.push(entry);
		}

		const result: GroupedScheme[] = [];
		for (const [srKey, raterMap] of srMap) {
			const firstEntry = [...raterMap.values()][0][0];
			const seniorRaterLabel = getPersonDisplay(firstEntry.seniorRaterPersonId, firstEntry.seniorRaterName);

			const raterGroups: GroupedScheme['raterGroups'] = [];
			for (const [, raterEntries] of raterMap) {
				const firstRaterEntry = raterEntries[0];
				raterGroups.push({
					raterLabel: getPersonDisplay(firstRaterEntry.raterPersonId, firstRaterEntry.raterName),
					entries: raterEntries.sort((a, b) => a.ratingPeriodEnd.localeCompare(b.ratingPeriodEnd))
				});
			}
			result.push({ seniorRaterLabel, raterGroups });
		}
		return result;
	});

	function formatDueStatus(entry: RatingSchemeEntry): { label: string; color: string } {
		const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
		const days = getDaysUntilDue(entry.ratingPeriodEnd);
		const color = RATING_STATUS_COLORS[status];

		if (status === 'completed') return { label: 'Completed', color };
		if (status === 'overdue') return { label: `Overdue (${Math.abs(days)}d)`, color };
		if (status === 'due-30') return { label: `${days}d`, color };
		if (status === 'due-60') return { label: `${days}d`, color };
		return { label: 'Current', color };
	}

	function getRatedPersonLabel(id: string): string {
		const p = personnel.find((p) => p.id === id);
		return p ? `${p.rank} ${p.lastName}` : 'Unknown';
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
	}
</script>

{#if entries.length === 0}
	<EmptyState message="No rating scheme entries yet. Click 'Add Entry' to get started." />
{:else}
	<div class="grouped-view">
		{#each grouped as srGroup}
			<div class="sr-group">
				<div class="sr-header">
					<span class="sr-label">SR:</span>
					{srGroup.seniorRaterLabel}
				</div>
				{#each srGroup.raterGroups as rGroup}
					<div class="rater-group">
						<div class="rater-header">
							<span class="rater-label">Rater:</span>
							{rGroup.raterLabel}
						</div>
						{#each rGroup.entries as entry (entry.id)}
							{@const due = formatDueStatus(entry)}
							<button class="entry-row" onclick={() => onEdit(entry)}>
								<span class="rated-name">{getRatedPersonLabel(entry.ratedPersonId)}</span>
								<Badge
									label={entry.evalType}
									color={entry.evalType === 'OER' ? '#3b82f6' : entry.evalType === 'WOER' ? '#8b5cf6' : '#059669'}
								/>
								<span class="period">{formatDate(entry.ratingPeriodStart)}–{formatDate(entry.ratingPeriodEnd)}</span>
								<Badge label={due.label} color={due.color} />
							</button>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/if}

<style>
	.grouped-view {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.sr-group {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.sr-header {
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface-variant);
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.sr-label {
		color: var(--color-text-muted);
		font-weight: 400;
	}

	.rater-group {
		border-top: 1px solid var(--color-divider);
	}

	.rater-header {
		padding: var(--spacing-xs) var(--spacing-md);
		padding-left: var(--spacing-xl);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		background: var(--color-surface);
	}

	.rater-label {
		color: var(--color-text-muted);
	}

	.entry-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		padding-left: 48px;
		width: 100%;
		background: none;
		border: none;
		border-top: 1px solid var(--color-divider);
		cursor: pointer;
		text-align: left;
		font-size: var(--font-size-sm);
		color: var(--color-text);
		transition: background 0.1s;
	}

	.entry-row:hover {
		background: var(--color-surface-variant);
	}

	.rated-name {
		font-weight: 500;
		min-width: 140px;
	}

	.period {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		margin-left: auto;
	}
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/RatingSchemeGroupedView.svelte
git commit -m "feat(rating): add RatingSchemeGroupedView component"
```

---

### Task 9: Integrate Rating Scheme into Personnel Page

**Files:**

- Modify: `src/routes/org/[orgId]/personnel/+page.svelte`

**Step 1: Add the Rating Scheme view to the personnel page**

This is the main integration task. The personnel page already has a view toggle (A-Z / By Group). We need to add a top-level toggle: **Roster** | **Rating Scheme**, where Roster shows the existing content and Rating Scheme shows the new views.

Add imports:

```typescript
import { ratingSchemeStore } from '$lib/stores/ratingScheme.svelte';
import RatingSchemeEntryModal from '$lib/components/RatingSchemeEntryModal.svelte';
import RatingSchemeTableView from '$lib/components/RatingSchemeTableView.svelte';
import RatingSchemeGroupedView from '$lib/components/RatingSchemeGroupedView.svelte';
import type { RatingSchemeEntry, RatingDueStatus } from '$lib/types';
import { RATING_STATUS_COLORS } from '$lib/types';
import { getRatingDueStatus } from '$lib/utils/ratingScheme';
```

Add state:

```typescript
let pageView = $state<'roster' | 'rating-scheme'>('roster');
let ratingViewMode = $state<'grouped' | 'table'>('grouped');
let showRatingModal = $state(false);
let editingEntry = $state<RatingSchemeEntry | null>(null);
let ratingFilter = $state<'active' | 'completed' | 'change-of-rater' | 'all'>('active');
```

Add derived values for filtering and stats:

```typescript
const filteredRatingEntries = $derived.by(() => {
	const entries = ratingSchemeStore.list;
	if (ratingFilter === 'all') return entries;
	return entries.filter((e) => e.status === ratingFilter);
});

const ratingStats = $derived.by(() => {
	const active = ratingSchemeStore.list.filter((e) => e.status === 'active');
	const counts = { overdue: 0, 'due-30': 0, 'due-60': 0, current: 0, completed: 0 };
	for (const entry of ratingSchemeStore.list) {
		const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
		counts[status]++;
	}
	return counts;
});
```

Add handlers:

```typescript
function handleAddRatingEntry() {
	editingEntry = null;
	showRatingModal = true;
}

function handleEditRatingEntry(entry: RatingSchemeEntry) {
	editingEntry = entry;
	showRatingModal = true;
}

async function handleSaveRatingEntry(data: Omit<RatingSchemeEntry, 'id'>) {
	if (editingEntry) {
		await ratingSchemeStore.update(editingEntry.id, data);
	} else {
		await ratingSchemeStore.add(data);
	}
}

async function handleDeleteRatingEntry(id: string) {
	await ratingSchemeStore.remove(id);
}
```

Add a page-level view toggle (Roster | Rating Scheme) above the existing toolbar. When Rating Scheme is active, show the stats bar, filter, sub-view toggle (Grouped | Table), and the appropriate view component. Wrap the existing Roster content in a conditional `{#if pageView === 'roster'}` block.

The stats bar should show counts: Overdue | Due 30d | Due 60d | Current | Completed — each with the corresponding color dot from `RATING_STATUS_COLORS`.

The rating scheme toolbar should have: [Add Entry] button (if canEditPersonnel), filter dropdown, and Grouped/Table toggle.

Add the modal at the bottom:

```svelte
{#if showRatingModal}
	<RatingSchemeEntryModal
		entry={editingEntry}
		personnel={personnelStore.list}
		onSave={handleSaveRatingEntry}
		onDelete={editingEntry ? handleDeleteRatingEntry : undefined}
		onClose={() => {
			showRatingModal = false;
			editingEntry = null;
		}}
	/>
{/if}
```

**Step 2: Verify visually**

Run: `npm run dev` and navigate to Personnel page. Toggle to Rating Scheme view. Add an entry. Verify both grouped and table views render correctly.

**Step 3: Commit**

```bash
git add "src/routes/org/[orgId]/personnel/+page.svelte"
git commit -m "feat(rating): integrate rating scheme views into personnel page"
```

---

### Task 10: Add Help Content

**Files:**

- Modify: `src/lib/help-content.ts`

**Step 1: Add rating scheme help topic**

Add a new entry to the `helpContent` map:

```typescript
'rating-scheme': {
	title: 'Rating Scheme',
	content: `
		<p>Maintain your unit's OER/NCOER/WOER rating chains and track when evaluations are due, in accordance with AR 623-3.</p>

		<h4>Adding Entries</h4>
		<p>Click <strong>Add Entry</strong> to add a person to the rating scheme. Select the rated individual, and the evaluation type (OER/NCOER/WOER) will auto-suggest based on their rank. Set the rater and senior rater — these can be personnel from your organization or external individuals entered as freetext.</p>

		<h4>Optional Rating Officials</h4>
		<p>Click "+ Add Intermediate Rater" or "+ Add Reviewer" to add these optional roles when your rating scheme requires them.</p>

		<h4>Due Date Tracking</h4>
		<p>Set the rating period start and thru date (end date). The system shows color-coded warnings as the thru date approaches:</p>
		<ul>
			<li><strong style="color:#22c55e;">Green</strong> — more than 60 days out</li>
			<li><strong style="color:#eab308;">Yellow</strong> — within 60 days</li>
			<li><strong style="color:#f97316;">Orange</strong> — within 30 days</li>
			<li><strong style="color:#ef4444;">Red</strong> — overdue</li>
		</ul>

		<h4>Views</h4>
		<ul>
			<li><strong>Grouped</strong> — entries organized by senior rater and rater, showing the chain hierarchy</li>
			<li><strong>Table</strong> — flat sortable table for quick scanning and initial setup</li>
		</ul>

		<h4>Statuses</h4>
		<ul>
			<li><strong>Active</strong> — current rating period in progress</li>
			<li><strong>Completed</strong> — evaluation submitted</li>
			<li><strong>Change of Rater</strong> — triggered by PCS, reassignment, etc.</li>
		</ul>
	`
}
```

**Step 2: Commit**

```bash
git add src/lib/help-content.ts
git commit -m "feat(rating): add rating scheme help content"
```

---

### Task 11: Build Check

**Step 1: Run type checking**

Run: `npm run check`
Expected: No new errors (pre-existing warnings are fine)

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit if any fixes needed**
