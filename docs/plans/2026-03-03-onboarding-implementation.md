# Onboarding Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a personnel onboarding tracker with org-level templates, three step types (training/paperwork/checkbox), per-step notes, and inline progress tracking.

**Architecture:** Three new Supabase tables (`onboarding_template_steps`, `personnel_onboardings`, `onboarding_step_progress`), two Svelte 5 rune-based stores, three API route files, a new top-level page at `/org/[orgId]/onboarding`, and supporting modal/manager components. Training steps auto-resolve from existing `personnel_trainings`. Template data is snapshotted at enrollment time.

**Tech Stack:** SvelteKit 2.5 + Svelte 5 (runes), TypeScript, Supabase (Postgres + RLS), pure CSS variables (no Tailwind).

**Design Doc:** `docs/plans/2026-03-03-onboarding-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260303_onboarding.sql`

**Step 1: Write the migration SQL**

```sql
-- Onboarding Template Steps: org-level checklist definition
create table public.onboarding_template_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  step_type text not null check (step_type in ('training', 'paperwork', 'checkbox')),
  training_type_id uuid references public.training_types(id) on delete set null,
  stages jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index onboarding_template_steps_org_idx on public.onboarding_template_steps(organization_id);

alter table public.onboarding_template_steps enable row level security;

create policy "Org members can view onboarding template steps"
  on public.onboarding_template_steps for select
  using (public.can_view_personnel(organization_id));

create policy "Org editors can manage onboarding template steps"
  on public.onboarding_template_steps for all
  using (public.can_edit_personnel(organization_id));

-- Personnel Onboardings: enrolls a person in the onboarding process
create table public.personnel_onboardings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  personnel_id uuid not null references public.personnel(id) on delete cascade,
  started_at date not null default current_date,
  completed_at date,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

-- Only one active onboarding per person per org
create unique index personnel_onboardings_active_idx
  on public.personnel_onboardings(organization_id, personnel_id)
  where status = 'in_progress';

create index personnel_onboardings_org_idx on public.personnel_onboardings(organization_id);

alter table public.personnel_onboardings enable row level security;

create policy "Org members can view onboardings"
  on public.personnel_onboardings for select
  using (public.can_view_personnel(organization_id));

create policy "Org editors can manage onboardings"
  on public.personnel_onboardings for all
  using (public.can_edit_personnel(organization_id));

-- Onboarding Step Progress: per-person progress on each step (snapshotted from template)
create table public.onboarding_step_progress (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.personnel_onboardings(id) on delete cascade,
  step_name text not null,
  step_type text not null check (step_type in ('training', 'paperwork', 'checkbox')),
  training_type_id uuid references public.training_types(id) on delete set null,
  stages jsonb,
  sort_order int not null default 0,
  completed boolean not null default false,
  current_stage text,
  notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index onboarding_step_progress_onboarding_idx on public.onboarding_step_progress(onboarding_id);

alter table public.onboarding_step_progress enable row level security;

create policy "Org members can view step progress"
  on public.onboarding_step_progress for select
  using (
    exists (
      select 1 from public.personnel_onboardings po
      where po.id = onboarding_step_progress.onboarding_id
      and public.can_view_personnel(po.organization_id)
    )
  );

create policy "Org editors can manage step progress"
  on public.onboarding_step_progress for all
  using (
    exists (
      select 1 from public.personnel_onboardings po
      where po.id = onboarding_step_progress.onboarding_id
      and public.can_edit_personnel(po.organization_id)
    )
  );
```

**Step 2: Apply the migration to your Supabase instance**

Run via Supabase dashboard SQL editor or `supabase db push`.

**Step 3: Commit**

```bash
git add supabase/migrations/20260303_onboarding.sql
git commit -m "feat(onboarding): add database tables for onboarding feature"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts` (append new interfaces at end of file)

**Step 1: Add onboarding type definitions**

Add these interfaces to the end of `src/lib/types.ts`:

```typescript
// Onboarding
export type OnboardingStepType = 'training' | 'paperwork' | 'checkbox';
export type OnboardingStatus = 'in_progress' | 'completed' | 'cancelled';

export interface OnboardingTemplateStep {
	id: string;
	name: string;
	description: string | null;
	stepType: OnboardingStepType;
	trainingTypeId: string | null;
	stages: string[] | null;
	sortOrder: number;
}

export interface OnboardingStepNote {
	text: string;
	timestamp: string;
}

export interface OnboardingStepProgress {
	id: string;
	onboardingId: string;
	stepName: string;
	stepType: OnboardingStepType;
	trainingTypeId: string | null;
	stages: string[] | null;
	sortOrder: number;
	completed: boolean;
	currentStage: string | null;
	notes: OnboardingStepNote[];
}

export interface PersonnelOnboarding {
	id: string;
	personnelId: string;
	startedAt: string;
	completedAt: string | null;
	status: OnboardingStatus;
	steps: OnboardingStepProgress[];
}
```

**Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(onboarding): add TypeScript interfaces for onboarding"
```

---

## Task 3: Onboarding Template Store

**Files:**
- Create: `src/lib/stores/onboardingTemplate.svelte.ts`

**Step 1: Implement the store**

Follow the exact pattern from `src/lib/stores/trainingTypes.svelte.ts`: private `$state` fields, `.list` getter sorted by `sortOrder`, `.load()` for hydration, optimistic `add`/`update`/`remove` with rollback. API path: `/org/${orgId}/api/onboarding-template`.

```typescript
import type { OnboardingTemplateStep } from '../types';

class OnboardingTemplateStore {
	#steps = $state<OnboardingTemplateStep[]>([]);
	#orgId = '';

	get list() {
		return [...this.#steps].sort((a, b) => a.sortOrder - b.sortOrder);
	}

	load(steps: OnboardingTemplateStep[], orgId: string) {
		this.#steps = steps;
		this.#orgId = orgId;
	}

	async add(data: Omit<OnboardingTemplateStep, 'id'>): Promise<OnboardingTemplateStep | null> {
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimistic: OnboardingTemplateStep = { id: tempId, ...data };
		this.#steps = [...this.#steps, optimistic];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add template step');
			const newStep = await res.json();
			this.#steps = this.#steps.map((s) => (s.id === tempId ? newStep : s));
			return newStep;
		} catch {
			this.#steps = this.#steps.filter((s) => s.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<OnboardingTemplateStep, 'id'>>): Promise<boolean> {
		const original = this.#steps.find((s) => s.id === id);
		if (!original) return false;

		this.#steps = this.#steps.map((s) => (s.id === id ? { ...s, ...data } : s));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update template step');
			const updated = await res.json();
			this.#steps = this.#steps.map((s) => (s.id === id ? updated : s));
			return true;
		} catch {
			this.#steps = this.#steps.map((s) => (s.id === id ? original : s));
			return false;
		}
	}

	async remove(id: string): Promise<boolean> {
		const original = this.#steps.find((s) => s.id === id);
		if (!original) return false;

		this.#steps = this.#steps.filter((s) => s.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete template step');
			return true;
		} catch {
			this.#steps = [...this.#steps, original];
			return false;
		}
	}

	getById(id: string) {
		return this.#steps.find((s) => s.id === id);
	}
}

export const onboardingTemplateStore = new OnboardingTemplateStore();
```

**Step 2: Commit**

```bash
git add src/lib/stores/onboardingTemplate.svelte.ts
git commit -m "feat(onboarding): add onboarding template store"
```

---

## Task 4: Onboarding Store

**Files:**
- Create: `src/lib/stores/onboarding.svelte.ts`

**Step 1: Implement the store**

This store manages `PersonnelOnboarding` records (with nested `steps` arrays). It needs methods for:
- `load()` — hydrate from server
- `startOnboarding(personnelId, startedAt)` — POST to create onboarding + snapshot steps
- `updateStepProgress(stepId, data)` — PUT to update a step's completed/currentStage/notes
- `cancelOnboarding(id)` — PUT to set status to cancelled
- `completeOnboarding(id)` — PUT to set status to completed
- Getters: `list`, `getByPersonnelId(id)`, `activeList` (only in_progress)

```typescript
import type { PersonnelOnboarding, OnboardingStepProgress } from '../types';

class OnboardingStore {
	#onboardings = $state<PersonnelOnboarding[]>([]);
	#orgId = '';

	get list() {
		return this.#onboardings;
	}

	get activeList() {
		return this.#onboardings.filter((o) => o.status === 'in_progress');
	}

	load(onboardings: PersonnelOnboarding[], orgId: string) {
		this.#onboardings = onboardings;
		this.#orgId = orgId;
	}

	getByPersonnelId(personnelId: string) {
		return this.#onboardings.find(
			(o) => o.personnelId === personnelId && o.status === 'in_progress'
		);
	}

	getById(id: string) {
		return this.#onboardings.find((o) => o.id === id);
	}

	async startOnboarding(personnelId: string, startedAt: string): Promise<PersonnelOnboarding | null> {
		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ personnelId, startedAt })
			});
			if (!res.ok) throw new Error('Failed to start onboarding');
			const newOnboarding = await res.json();
			this.#onboardings = [...this.#onboardings, newOnboarding];
			return newOnboarding;
		} catch {
			return null;
		}
	}

	async updateStepProgress(
		stepId: string,
		data: Partial<Pick<OnboardingStepProgress, 'completed' | 'currentStage' | 'notes'>>
	): Promise<boolean> {
		// Find which onboarding contains this step
		const onboarding = this.#onboardings.find((o) =>
			o.steps.some((s) => s.id === stepId)
		);
		if (!onboarding) return false;

		const originalSteps = [...onboarding.steps];
		const updatedSteps = onboarding.steps.map((s) =>
			s.id === stepId ? { ...s, ...data } : s
		);

		this.#onboardings = this.#onboardings.map((o) =>
			o.id === onboarding.id ? { ...o, steps: updatedSteps } : o
		);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-progress`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: stepId, ...data })
			});
			if (!res.ok) throw new Error('Failed to update step progress');
			return true;
		} catch {
			this.#onboardings = this.#onboardings.map((o) =>
				o.id === onboarding.id ? { ...o, steps: originalSteps } : o
			);
			return false;
		}
	}

	async cancelOnboarding(id: string): Promise<boolean> {
		const original = this.#onboardings.find((o) => o.id === id);
		if (!original) return false;

		this.#onboardings = this.#onboardings.map((o) =>
			o.id === id ? { ...o, status: 'cancelled' as const } : o
		);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, status: 'cancelled' })
			});
			if (!res.ok) throw new Error('Failed to cancel onboarding');
			return true;
		} catch {
			this.#onboardings = this.#onboardings.map((o) =>
				o.id === id ? original : o
			);
			return false;
		}
	}

	async completeOnboarding(id: string): Promise<boolean> {
		const original = this.#onboardings.find((o) => o.id === id);
		if (!original) return false;

		const today = new Date().toISOString().split('T')[0];
		this.#onboardings = this.#onboardings.map((o) =>
			o.id === id ? { ...o, status: 'completed' as const, completedAt: today } : o
		);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, status: 'completed', completedAt: today })
			});
			if (!res.ok) throw new Error('Failed to complete onboarding');
			return true;
		} catch {
			this.#onboardings = this.#onboardings.map((o) =>
				o.id === id ? original : o
			);
			return false;
		}
	}
}

export const onboardingStore = new OnboardingStore();
```

**Step 2: Commit**

```bash
git add src/lib/stores/onboarding.svelte.ts
git commit -m "feat(onboarding): add onboarding store with step progress management"
```

---

## Task 5: Onboarding Template API Route

**Files:**
- Create: `src/routes/org/[orgId]/api/onboarding-template/+server.ts`

**Step 1: Implement the API route**

Follow the manual API pattern from `src/routes/org/[orgId]/api/duty-roster-history/+server.ts`. Supports POST (add), PUT (update), DELETE (remove). Uses `getApiContext` + `requireEditPermission` with `'personnel'` permission. Transforms snake_case ↔ camelCase.

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';

function transformRow(r: any) {
	return {
		id: r.id,
		name: r.name,
		description: r.description,
		stepType: r.step_type,
		trainingTypeId: r.training_type_id,
		stages: r.stages,
		sortOrder: r.sort_order
	};
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();

	const { data, error: dbError } = await supabase
		.from('onboarding_template_steps')
		.insert({
			organization_id: orgId,
			name: body.name,
			description: body.description ?? null,
			step_type: body.stepType,
			training_type_id: body.trainingTypeId ?? null,
			stages: body.stages ?? null,
			sort_order: body.sortOrder ?? 0
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);
	return json(transformRow(data));
};

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id, ...fields } = body;

	const updateData: Record<string, unknown> = {};
	if (fields.name !== undefined) updateData.name = fields.name;
	if (fields.description !== undefined) updateData.description = fields.description;
	if (fields.stepType !== undefined) updateData.step_type = fields.stepType;
	if (fields.trainingTypeId !== undefined) updateData.training_type_id = fields.trainingTypeId;
	if (fields.stages !== undefined) updateData.stages = fields.stages;
	if (fields.sortOrder !== undefined) updateData.sort_order = fields.sortOrder;

	const { data, error: dbError } = await supabase
		.from('onboarding_template_steps')
		.update(updateData)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);
	return json(transformRow(data));
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const { id } = await request.json();

	const { error: dbError } = await supabase
		.from('onboarding_template_steps')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);
	return json({ success: true });
};
```

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/api/onboarding-template/+server.ts
git commit -m "feat(onboarding): add onboarding template API route"
```

---

## Task 6: Onboarding API Route

**Files:**
- Create: `src/routes/org/[orgId]/api/onboarding/+server.ts`

**Step 1: Implement the API route**

POST creates a new `personnel_onboardings` row AND snapshots all current template steps into `onboarding_step_progress` rows. Returns the full onboarding with nested steps. PUT updates status/completedAt. DELETE removes an onboarding.

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';

function transformStep(r: any) {
	return {
		id: r.id,
		onboardingId: r.onboarding_id,
		stepName: r.step_name,
		stepType: r.step_type,
		trainingTypeId: r.training_type_id,
		stages: r.stages,
		sortOrder: r.sort_order,
		completed: r.completed,
		currentStage: r.current_stage,
		notes: r.notes ?? []
	};
}

function transformOnboarding(r: any, steps: any[]) {
	return {
		id: r.id,
		personnelId: r.personnel_id,
		startedAt: r.started_at,
		completedAt: r.completed_at,
		status: r.status,
		steps: steps.map(transformStep)
	};
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();

	// Create the onboarding record
	const { data: onboarding, error: onboardingError } = await supabase
		.from('personnel_onboardings')
		.insert({
			organization_id: orgId,
			personnel_id: body.personnelId,
			started_at: body.startedAt
		})
		.select()
		.single();

	if (onboardingError) throw error(500, onboardingError.message);

	// Fetch current template steps to snapshot
	const { data: templateSteps, error: templateError } = await supabase
		.from('onboarding_template_steps')
		.select('*')
		.eq('organization_id', orgId)
		.order('sort_order');

	if (templateError) throw error(500, templateError.message);

	// Create step progress rows from template snapshot
	let steps: any[] = [];
	if (templateSteps && templateSteps.length > 0) {
		const stepRows = templateSteps.map((t: any) => ({
			onboarding_id: onboarding.id,
			step_name: t.name,
			step_type: t.step_type,
			training_type_id: t.training_type_id,
			stages: t.stages,
			sort_order: t.sort_order,
			completed: false,
			current_stage: t.step_type === 'paperwork' && t.stages?.length ? t.stages[0] : null,
			notes: '[]'
		}));

		const { data: createdSteps, error: stepsError } = await supabase
			.from('onboarding_step_progress')
			.insert(stepRows)
			.select();

		if (stepsError) throw error(500, stepsError.message);
		steps = createdSteps ?? [];
	}

	return json(transformOnboarding(onboarding, steps));
};

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id, ...fields } = body;

	const updateData: Record<string, unknown> = {};
	if (fields.status !== undefined) updateData.status = fields.status;
	if (fields.completedAt !== undefined) updateData.completed_at = fields.completedAt;

	const { data, error: dbError } = await supabase
		.from('personnel_onboardings')
		.update(updateData)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	// Fetch steps for response
	const { data: steps } = await supabase
		.from('onboarding_step_progress')
		.select('*')
		.eq('onboarding_id', id)
		.order('sort_order');

	return json(transformOnboarding(data, steps ?? []));
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const { id } = await request.json();

	const { error: dbError } = await supabase
		.from('personnel_onboardings')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);
	return json({ success: true });
};
```

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/api/onboarding/+server.ts
git commit -m "feat(onboarding): add onboarding API route with template snapshot on creation"
```

---

## Task 7: Onboarding Progress API Route

**Files:**
- Create: `src/routes/org/[orgId]/api/onboarding-progress/+server.ts`

**Step 1: Implement the API route**

PUT only. Updates a single `onboarding_step_progress` row's `completed`, `current_stage`, and/or `notes` fields. Permission check via the parent onboarding's org_id.

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id, ...fields } = body;

	const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (fields.completed !== undefined) updateData.completed = fields.completed;
	if (fields.currentStage !== undefined) updateData.current_stage = fields.currentStage;
	if (fields.notes !== undefined) updateData.notes = fields.notes;

	const { data, error: dbError } = await supabase
		.from('onboarding_step_progress')
		.update(updateData)
		.eq('id', id)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		onboardingId: data.onboarding_id,
		stepName: data.step_name,
		stepType: data.step_type,
		trainingTypeId: data.training_type_id,
		stages: data.stages,
		sortOrder: data.sort_order,
		completed: data.completed,
		currentStage: data.current_stage,
		notes: data.notes ?? []
	});
};
```

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/api/onboarding-progress/+server.ts
git commit -m "feat(onboarding): add step progress update API route"
```

---

## Task 8: Data Loading — Page Server

**Files:**
- Create: `src/routes/org/[orgId]/onboarding/+page.server.ts`

**Step 1: Implement server-side data loading**

Load template steps, onboardings with nested step progress. Training types and personnel trainings are already available from the parent layout. The parent `+layout.server.ts` at `/org/[orgId]/` already provides `personnel`, `trainingTypes`, and `personnelTrainings` via `fetchSharedData()`.

```typescript
import type { PageServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	const [templateRes, onboardingsRes] = await Promise.all([
		supabase
			.from('onboarding_template_steps')
			.select('*')
			.eq('organization_id', orgId)
			.order('sort_order'),
		supabase
			.from('personnel_onboardings')
			.select('*')
			.eq('organization_id', orgId)
			.order('created_at', { ascending: false })
	]);

	const onboardings = onboardingsRes.data ?? [];

	// Fetch step progress for all onboardings
	let allSteps: any[] = [];
	if (onboardings.length > 0) {
		const onboardingIds = onboardings.map((o: any) => o.id);
		const { data: steps } = await supabase
			.from('onboarding_step_progress')
			.select('*')
			.in('onboarding_id', onboardingIds)
			.order('sort_order');
		allSteps = steps ?? [];
	}

	// Group steps by onboarding_id
	const stepsByOnboarding = new Map<string, any[]>();
	for (const step of allSteps) {
		const existing = stepsByOnboarding.get(step.onboarding_id) ?? [];
		existing.push(step);
		stepsByOnboarding.set(step.onboarding_id, existing);
	}

	return {
		orgId,
		onboardingTemplateSteps: (templateRes.data ?? []).map((t: any) => ({
			id: t.id,
			name: t.name,
			description: t.description,
			stepType: t.step_type,
			trainingTypeId: t.training_type_id,
			stages: t.stages,
			sortOrder: t.sort_order
		})),
		onboardings: onboardings.map((o: any) => ({
			id: o.id,
			personnelId: o.personnel_id,
			startedAt: o.started_at,
			completedAt: o.completed_at,
			status: o.status,
			steps: (stepsByOnboarding.get(o.id) ?? []).map((s: any) => ({
				id: s.id,
				onboardingId: s.onboarding_id,
				stepName: s.step_name,
				stepType: s.step_type,
				trainingTypeId: s.training_type_id,
				stages: s.stages,
				sortOrder: s.sort_order,
				completed: s.completed,
				currentStage: s.current_stage,
				notes: s.notes ?? []
			}))
		}))
	};
};
```

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/onboarding/+page.server.ts
git commit -m "feat(onboarding): add onboarding page server data loading"
```

---

## Task 9: Onboarding Template Manager Component

**Files:**
- Create: `src/lib/components/OnboardingTemplateManager.svelte`

**Step 1: Implement the component**

Follow the pattern from `TrainingTypeManager.svelte`: rendered inside a Modal, callback props for `onAdd`/`onUpdate`/`onRemove`/`onClose`. Form varies by step type. Supports reordering via move up/down buttons. Uses Badge, EmptyState, ConfirmDialog.

Key behaviors:
- List existing template steps sorted by `sortOrder`
- "Add Step" form with type selector (training/paperwork/checkbox)
  - Training: shows dropdown of available training types (passed as prop)
  - Paperwork: name + stage list editor (text inputs, add/remove buttons)
  - Checkbox: name + optional description
- Edit mode inline per step
- Move up/down reordering
- Delete with ConfirmDialog

Props:
```typescript
interface Props {
	templateSteps: OnboardingTemplateStep[];
	trainingTypes: TrainingType[];
	onAdd: (data: Omit<OnboardingTemplateStep, 'id'>) => void;
	onUpdate: (id: string, data: Partial<Omit<OnboardingTemplateStep, 'id'>>) => void;
	onRemove: (id: string) => void;
	onClose: () => void;
}
```

This is a substantial component (~300-400 lines). Build the add form, edit mode, and list with reordering following TrainingTypeManager patterns exactly. Use Modal as wrapper. Use Badge to show step type. Use EmptyState when no steps.

**Step 2: Commit**

```bash
git add src/lib/components/OnboardingTemplateManager.svelte
git commit -m "feat(onboarding): add template manager component"
```

---

## Task 10: Start Onboarding Modal Component

**Files:**
- Create: `src/lib/components/StartOnboardingModal.svelte`

**Step 1: Implement the component**

Simple modal with:
- Searchable personnel picker (dropdown filtering people NOT currently being onboarded)
- Start date input (defaults to today)
- Save button

Props:
```typescript
interface Props {
	personnel: Personnel[];
	existingOnboardingPersonnelIds: string[];
	onSubmit: (personnelId: string, startedAt: string) => void;
	onClose: () => void;
}
```

Pattern: Modal wrapper, form-group with `.select` for personnel picker (or searchable input), `.input` for date. Footer: `[Cancel] [Start Onboarding]`. Use Spinner for saving state.

**Step 2: Commit**

```bash
git add src/lib/components/StartOnboardingModal.svelte
git commit -m "feat(onboarding): add start onboarding modal component"
```

---

## Task 11: Onboarding Page

**Files:**
- Create: `src/routes/org/[orgId]/onboarding/+page.svelte`

**Step 1: Implement the page**

This is the main page. Follow the pattern from `src/routes/org/[orgId]/training/+page.svelte` and `src/routes/org/[orgId]/+page.svelte` (dashboard).

Structure:
1. **Script section**: Import stores, hydrate via `$effect()`, derive computed values
2. **Header**: Page title "Onboarding" with action buttons (manage template, start onboarding)
3. **Filter toggle**: Show active / all (including completed/cancelled)
4. **Person list**: Cards for each onboarding showing rank+name, started date, progress bar, status badge
5. **Inline expand**: Click a card to toggle expansion showing step details
6. **Step detail rows**: Each step shows type badge, name, status indicator
   - Checkbox: clickable toggle
   - Training: auto-resolved (green check / red X from personnelTrainings)
   - Paperwork: stage indicator with advance/retreat buttons
7. **Per-step notes**: Collapsible notes section with "Add Note" input
8. **Sidebar**: Pass appropriate callbacks for onboarding-specific tools

Key derived values:
- `availablePersonnel` — people not currently being onboarded
- Per-onboarding progress count (completed steps / total steps)
- Training step auto-completion: check `personnelTrainingsStore.list` for matching `trainingTypeId` + `personnelId` with non-expired record

The page should also handle auto-completion: when all steps for an onboarding are complete, call `onboardingStore.completeOnboarding(id)`.

Import the Sidebar component and pass `onShowOnboardingTemplateManager` callback.

**Step 2: Commit**

```bash
git add src/routes/org/[orgId]/onboarding/+page.svelte
git commit -m "feat(onboarding): add onboarding page with list, inline detail, and step management"
```

---

## Task 12: Sidebar Navigation Update

**Files:**
- Modify: `src/lib/components/Sidebar.svelte`

**Step 1: Add Onboarding nav item**

Add a new nav link for "Onboarding" in the main nav section, after the Training link and before the Leaders Book link. Gate behind `perms.canViewPersonnel` (same as Personnel).

Add to the Props interface:
```typescript
// Onboarding-specific callbacks
onShowOnboardingTemplateManager?: () => void;
```

Add to destructuring:
```typescript
onShowOnboardingTemplateManager,
```

Add nav link in the markup (after Training, before Leaders Book):
```svelte
{#if perms.canViewPersonnel}
	<a
		href="/org/{orgId}/onboarding"
		class="nav-item"
		class:active={isActive(`/org/${orgId}/onboarding`)}
		onclick={() => onClose?.()}
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
			<rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
			<path d="M9 14l2 2 4-4" />
		</svg>
		Onboarding
	</a>
{/if}
```

Add an "Onboarding Tools" section (similar to Training Tools) that appears when on the onboarding page:
```svelte
{#if perms.canEditPersonnel && onShowOnboardingTemplateManager}
	<div class="nav-section" class:collapsed={collapsedSections.has('onboarding-tools')}>
		<button class="section-header" onclick={() => toggleSection('onboarding-tools')}>
			<span class="section-title">Onboarding Tools</span>
			<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</button>
		{#if !collapsedSections.has('onboarding-tools')}
			<div class="section-content">
				<button class="nav-item" onclick={() => handleNavClick(onShowOnboardingTemplateManager)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
					Manage Template
				</button>
			</div>
		{/if}
	</div>
{/if}
```

**Step 2: Commit**

```bash
git add src/lib/components/Sidebar.svelte
git commit -m "feat(onboarding): add onboarding navigation to sidebar"
```

---

## Task 13: Build Verification & Smoke Test

**Step 1: Run type checking**

```bash
npm run check
```

Expected: No new type errors (pre-existing errors from MEMORY.md are OK).

**Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Manual smoke test**

Start dev server (`npm run dev`), navigate to `/org/[orgId]/onboarding`:
- Verify page loads, sidebar shows "Onboarding" link
- Test "Manage Template" → template manager modal opens
- Add a checkbox step, a paperwork step with stages, and a training-linked step
- Test "Start Onboarding" → select a person → verify onboarding appears in list
- Test inline expand → verify step types render correctly
- Toggle a checkbox step → verify it saves
- Advance a paperwork step through stages → verify stage progression
- Add a note to a step → verify it appears with timestamp
- Verify training step auto-resolves from training records

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(onboarding): address issues found during smoke testing"
```

---

## Task Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Database migration | `supabase/migrations/20260303_onboarding.sql` |
| 2 | TypeScript types | `src/lib/types.ts` |
| 3 | Template store | `src/lib/stores/onboardingTemplate.svelte.ts` |
| 4 | Onboarding store | `src/lib/stores/onboarding.svelte.ts` |
| 5 | Template API route | `src/routes/org/[orgId]/api/onboarding-template/+server.ts` |
| 6 | Onboarding API route | `src/routes/org/[orgId]/api/onboarding/+server.ts` |
| 7 | Progress API route | `src/routes/org/[orgId]/api/onboarding-progress/+server.ts` |
| 8 | Page server load | `src/routes/org/[orgId]/onboarding/+page.server.ts` |
| 9 | Template manager component | `src/lib/components/OnboardingTemplateManager.svelte` |
| 10 | Start onboarding modal | `src/lib/components/StartOnboardingModal.svelte` |
| 11 | Onboarding page | `src/routes/org/[orgId]/onboarding/+page.svelte` |
| 12 | Sidebar nav update | `src/lib/components/Sidebar.svelte` |
| 13 | Build verification | N/A |
