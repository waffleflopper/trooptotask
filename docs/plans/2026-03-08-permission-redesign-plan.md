# Permission System Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the permission system to support three roles (owner/admin/member) with optional group-scoped access for members.

**Architecture:** Add `admin` to the `organization_role` enum and add a `scoped_group_id` FK to memberships. Admins bypass permission flags like owners but can't do destructive ops. Group-scoped members see filtered data on personnel/training/leaders-book pages but full calendar. All enforcement happens in the layout data loader, API permission helpers, and RLS functions.

**Tech Stack:** SvelteKit, Supabase (Postgres), TypeScript

---

## Phase 1: Database Migration & Core Types

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260308_permission_redesign.sql`

**Step 1: Write the migration**

```sql
-- 1. Add 'admin' to the organization_role enum
ALTER TYPE organization_role ADD VALUE IF NOT EXISTS 'admin';

-- 2. Add scoped_group_id to memberships
ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS scoped_group_id UUID REFERENCES groups(id) ON DELETE SET NULL;

-- 3. Add scoped_group_id to invitations
ALTER TABLE organization_invitations
  ADD COLUMN IF NOT EXISTS scoped_group_id UUID REFERENCES groups(id) ON DELETE SET NULL;

-- 4. Update RLS helper functions to recognize 'admin' role alongside 'owner'
CREATE OR REPLACE FUNCTION public.can_edit_calendar(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_calendar = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_personnel(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_personnel = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_training(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_training = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_calendar(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_calendar = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_personnel(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_personnel = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_training(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_training = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org_members(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_manage_members = true)
  );
END;
$$;

-- 5. Update is_org_owner to also return true for admins where appropriate
-- NOTE: Keep is_org_owner as owner-only (used for destructive operations like transfer_org_ownership)

-- 6. Update transfer_org_ownership to demote to 'admin' instead of 'member'
CREATE OR REPLACE FUNCTION public.transfer_org_ownership(p_organization_id uuid, p_new_owner_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_org_owner(p_organization_id) THEN
    RAISE EXCEPTION 'Only the owner can transfer ownership';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = p_new_owner_id
  ) THEN
    RAISE EXCEPTION 'New owner must be an existing member';
  END IF;

  -- Demote current owner to admin (keeps full access minus owner-only actions)
  UPDATE public.organization_memberships
  SET role = 'admin',
      can_view_calendar = true,
      can_edit_calendar = true,
      can_view_personnel = true,
      can_edit_personnel = true,
      can_view_training = true,
      can_edit_training = true,
      can_manage_members = true,
      scoped_group_id = NULL
  WHERE organization_id = p_organization_id AND user_id = auth.uid();

  -- Promote new owner
  UPDATE public.organization_memberships
  SET role = 'owner',
      can_view_calendar = true,
      can_edit_calendar = true,
      can_view_personnel = true,
      can_edit_personnel = true,
      can_view_training = true,
      can_edit_training = true,
      can_manage_members = true,
      scoped_group_id = NULL
  WHERE organization_id = p_organization_id AND user_id = p_new_owner_id;
END;
$$;
```

**Step 2: Apply migration locally**

Run: `npx supabase db push` or `npx supabase migration up`
Expected: Migration applies successfully. Verify with `npx supabase db diff` showing no differences.

**Step 3: Commit**

```bash
git add supabase/migrations/20260308_permission_redesign.sql
git commit -m "feat: add admin role and scoped_group_id to permission system"
```

---

## Phase 2: Update TypeScript Types & Permission Helpers

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Update the types and presets**

In `src/lib/types.ts`, make these changes:

1. Update `OrganizationMember.role` type from `'owner' | 'member'` to `'owner' | 'admin' | 'member'`

2. Add `scopedGroupId` to `OrganizationMember`:
```typescript
export interface OrganizationMember extends OrganizationMemberPermissions {
	id: string;
	organizationId: string;
	userId: string;
	email?: string;
	role: 'owner' | 'admin' | 'member';
	scopedGroupId: string | null;
	createdAt: string;
}
```

3. Add `scopedGroupId` to `OrganizationInvitation`:
```typescript
export interface OrganizationInvitation {
	id: string;
	organizationId: string;
	email: string;
	status: 'pending' | 'accepted' | 'revoked';
	permissions: OrganizationMemberPermissions;
	scopedGroupId: string | null;
	createdAt: string;
}
```

4. Add `'team-leader'` to `PermissionPreset`:
```typescript
export type PermissionPreset =
	| 'owner'
	| 'admin'
	| 'full-editor'
	| 'team-leader'
	| 'calendar-only'
	| 'personnel-only'
	| 'training-only'
	| 'viewer'
	| 'custom';
```

5. Add `team-leader` to `PERMISSION_PRESETS`:
```typescript
'team-leader': {
	canViewCalendar: true,
	canEditCalendar: true,
	canViewPersonnel: true,
	canEditPersonnel: true,
	canViewTraining: true,
	canEditTraining: true,
	canManageMembers: false
},
```

Note: The team-leader preset has the same permission flags as full-editor. The difference is that team-leader will set `scoped_group_id` to a specific group — that's handled in the invite/update UI, not in the flags.

**Step 2: Run type check**

Run: `npm run check`
Expected: May have new errors from code that references the old `'owner' | 'member'` type. Note them for the next tasks.

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add admin role, team-leader preset, and scopedGroupId to types"
```

### Task 3: Update Server Permission Helpers

**Files:**
- Modify: `src/lib/server/permissions.ts`

**Step 1: Update MembershipPermissions and all functions**

Replace the entire file with:

```typescript
import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PermissionType = 'calendar' | 'personnel' | 'training';

interface MembershipPermissions {
	role: 'owner' | 'admin' | 'member';
	can_edit_calendar: boolean;
	can_edit_personnel: boolean;
	can_edit_training: boolean;
	scoped_group_id: string | null;
}

async function getMembershipPermissions(
	supabase: SupabaseClient,
	orgId: string,
	userId: string
): Promise<MembershipPermissions | null> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role, can_edit_calendar, can_edit_personnel, can_edit_training, scoped_group_id')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	return membership as MembershipPermissions | null;
}

/** Returns true if the role bypasses individual permission flags */
function isPrivilegedRole(role: string): boolean {
	return role === 'owner' || role === 'admin';
}

export async function requireEditPermission(
	supabase: SupabaseClient,
	orgId: string,
	userId: string,
	permissionType: PermissionType
): Promise<void> {
	const membership = await getMembershipPermissions(supabase, orgId, userId);

	if (!membership) {
		throw error(403, 'Not a member of this organization');
	}

	// Owners and admins always have full access
	if (isPrivilegedRole(membership.role)) {
		return;
	}

	// Check specific permission for members
	switch (permissionType) {
		case 'calendar':
			if (!membership.can_edit_calendar) {
				throw error(403, 'You do not have permission to edit calendar data');
			}
			break;
		case 'personnel':
			if (!membership.can_edit_personnel) {
				throw error(403, 'You do not have permission to edit personnel data');
			}
			break;
		case 'training':
			if (!membership.can_edit_training) {
				throw error(403, 'You do not have permission to edit training data');
			}
			break;
	}
}

export async function requireManageMembersPermission(
	supabase: SupabaseClient,
	orgId: string,
	userId: string
): Promise<void> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role, can_manage_members')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership) {
		throw error(403, 'Not a member of this organization');
	}

	if (!isPrivilegedRole(membership.role) && !membership.can_manage_members) {
		throw error(403, 'You do not have permission to manage this organization');
	}
}

export async function requireOwnerRole(
	supabase: SupabaseClient,
	orgId: string,
	userId: string
): Promise<void> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership || membership.role !== 'owner') {
		throw error(403, 'Only the organization owner can perform this action');
	}
}

/** Returns the scoped group ID for the user, or null if org-wide access */
export async function getScopedGroupId(
	supabase: SupabaseClient,
	orgId: string,
	userId: string
): Promise<string | null> {
	const membership = await getMembershipPermissions(supabase, orgId, userId);
	if (!membership) return null;

	// Privileged roles are always org-wide
	if (isPrivilegedRole(membership.role)) return null;

	return membership.scoped_group_id;
}

/**
 * Checks if a personnel record belongs to the user's scoped group.
 * Throws 403 if the user is group-scoped and the personnel is not in their group.
 * Pass personnelGroupId = the group_id of the personnel being accessed.
 */
export async function requireGroupAccess(
	supabase: SupabaseClient,
	orgId: string,
	userId: string,
	personnelGroupId: string | null
): Promise<void> {
	const scopedGroupId = await getScopedGroupId(supabase, orgId, userId);

	// Org-wide access — no restriction
	if (!scopedGroupId) return;

	// Group-scoped: personnel must be in the user's group
	if (personnelGroupId !== scopedGroupId) {
		throw error(403, 'You do not have access to personnel outside your group');
	}
}
```

**Step 2: Run type check**

Run: `npm run check`
Expected: Should pass (or show only pre-existing errors).

**Step 3: Commit**

```bash
git add src/lib/server/permissions.ts
git commit -m "feat: update permission helpers for admin role and group scoping"
```

---

## Phase 3: Update Layout Data Loading

### Task 4: Update Layout to Load Scope & Filter Data

**Files:**
- Modify: `src/routes/org/[orgId]/+layout.server.ts`

**Step 1: Update membership select to include scoped_group_id and recognize admin role**

In the `load` function, find the membership query (around line 148-155) and add `scoped_group_id`:

```typescript
locals.supabase
	.from('organization_memberships')
	.select(
		'role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_manage_members, scoped_group_id'
	)
	.eq('organization_id', orgId)
	.eq('user_id', user.id)
	.single(),
```

**Step 2: Update isOwner check and permissions builder (around lines 177-188)**

Replace:
```typescript
const isOwner = membership.role === 'owner';
```
With:
```typescript
const isPrivileged = membership.role === 'owner' || membership.role === 'admin';
```

Then update all permission assignments to use `isPrivileged`:
```typescript
const permissions: OrganizationMemberPermissions = {
	canViewCalendar: isPrivileged || membership.can_view_calendar,
	canEditCalendar: isPrivileged || membership.can_edit_calendar,
	canViewPersonnel: isPrivileged || membership.can_view_personnel,
	canEditPersonnel: isPrivileged || membership.can_edit_personnel,
	canViewTraining: isPrivileged || membership.can_view_training,
	canEditTraining: isPrivileged || membership.can_edit_training,
	canManageMembers: isPrivileged || membership.can_manage_members
};
```

**Step 3: Determine scope and filter shared data**

After the permissions block, add group scope filtering:

```typescript
const scopedGroupId: string | null =
	isPrivileged ? null : (membership.scoped_group_id ?? null);

// Filter personnel data for group-scoped members
let { personnel, groups, statusTypes, trainingTypes, personnelTrainings, activeOnboardingPersonnelIds } = shared;

if (scopedGroupId) {
	const scopedPersonnelIds = new Set(
		personnel.filter(p => p.groupId === scopedGroupId).map(p => p.id)
	);
	personnel = personnel.filter(p => p.groupId === scopedGroupId);
	personnelTrainings = personnelTrainings.filter(pt => scopedPersonnelIds.has(pt.personnelId));
	activeOnboardingPersonnelIds = activeOnboardingPersonnelIds.filter(id => scopedPersonnelIds.has(id));
}
```

**Step 4: Update the return object**

Change `userRole` type and add new fields:
```typescript
return {
	orgId,
	orgName: org.name,
	userRole: membership.role as 'owner' | 'admin' | 'member',
	userId: user.id,
	permissions,
	scopedGroupId,
	isOwner: membership.role === 'owner',
	isAdmin: membership.role === 'admin',
	allOrgs,
	effectiveTier,
	isDemoReadOnly: false,
	isDemoSandbox: false,
	...shared data (personnel, groups, etc. — now potentially filtered)
};
```

Note: Keep `isOwner` as a separate boolean for template convenience. Add `isAdmin` too. Downstream pages that check `data.isOwner` for settings access need to be updated to `data.isOwner || data.isAdmin` in later tasks.

Also update the demo mode sections (showcase/sandbox) to include `scopedGroupId: null, isAdmin: false`.

**Step 5: Run type check and fix any issues**

Run: `npm run check`

**Step 6: Commit**

```bash
git add src/routes/org/[orgId]/+layout.server.ts
git commit -m "feat: add admin role recognition and group scope filtering to layout"
```

---

## Phase 4: Update Page-Level Data Filtering

### Task 5: Filter Leader's Book Data by Group Scope

**Files:**
- Modify: `src/routes/org/[orgId]/leaders-book/+page.server.ts`

**Step 1: Get scopedGroupId from parent and filter queries**

The leader's book loads its own data (extended info, counseling records, development goals, availability). When a user is group-scoped, we need to filter these to only personnel in their group.

After the parallel queries resolve, add filtering:

```typescript
export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const { scopedGroupId, personnel } = await parent();
	const supabase = getSupabaseClient(locals, cookies);

	// ... existing parallel queries ...

	// If group-scoped, filter to only personnel in scope
	if (scopedGroupId) {
		const scopedPersonnelIds = new Set(personnel.map(p => p.id));
		// Filter each result set
		extendedInfo = extendedInfo.filter(e => scopedPersonnelIds.has(e.personnelId));
		counselingRecords = counselingRecords.filter(r => scopedPersonnelIds.has(r.personnelId));
		developmentGoals = developmentGoals.filter(g => scopedPersonnelIds.has(g.personnelId));
		availability = availability.filter(a => scopedPersonnelIds.has(a.personnelId));
	}

	return { orgId, extendedInfo, counselingTypes, counselingRecords, developmentGoals, availability };
};
```

Note: `counselingTypes` are org-wide config, not personnel-specific — don't filter those.

**Step 2: Run type check**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/leaders-book/+page.server.ts
git commit -m "feat: filter leader's book data by group scope"
```

### Task 6: Filter Calendar Editing by Group Scope

**Files:**
- Modify: `src/routes/org/[orgId]/api/availability/+server.ts`

The calendar page shows all personnel (org-wide visibility), but group-scoped members can only edit availability for their group's people.

**Step 1: Add group scope check to the availability endpoint**

The availability endpoint uses `createCrudHandlers` which doesn't know about group scoping. We need to add a check. The simplest approach: override the POST and DELETE to add a group scope check.

Replace the file with:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCrudHandlers } from '$lib/server/crudFactory';
import type { AvailabilityEntry } from '$lib/types';
import { getApiContext } from '$lib/server/supabase';
import { requireGroupAccess } from '$lib/server/permissions';

const handlers = createCrudHandlers<AvailabilityEntry>({
	table: 'availability_entries',
	permission: 'calendar',
	fields: {
		personnelId: 'personnel_id',
		statusTypeId: 'status_type_id',
		startDate: 'start_date',
		endDate: 'end_date'
	},
	auditResourceType: 'availability',
	auditDetailFields: ['personnel_id', 'status_type_id', 'start_date', 'end_date']
});

// Wrap POST to enforce group scope
const originalPOST = handlers.POST;
export const POST: RequestHandler = async (event) => {
	const { orgId } = event.params;
	const { userId, isSandbox } = getApiContext(event.locals, event.cookies, orgId!);

	if (!isSandbox && userId) {
		const body = await event.request.clone().json();
		if (body.personnelId) {
			// Look up the personnel's group
			const { data: person } = await event.locals.supabase
				.from('personnel')
				.select('group_id')
				.eq('id', body.personnelId)
				.single();
			await requireGroupAccess(event.locals.supabase, orgId!, userId, person?.group_id ?? null);
		}
	}

	return originalPOST(event);
};

// Wrap DELETE to enforce group scope
const originalDELETE = handlers.DELETE;
export const DELETE: RequestHandler = async (event) => {
	const { orgId } = event.params;
	const { userId, isSandbox } = getApiContext(event.locals, event.cookies, orgId!);

	if (!isSandbox && userId) {
		const body = await event.request.clone().json();
		if (body.id) {
			// Look up the availability entry's personnel and their group
			const { data: entry } = await event.locals.supabase
				.from('availability_entries')
				.select('personnel_id')
				.eq('id', body.id)
				.single();
			if (entry) {
				const { data: person } = await event.locals.supabase
					.from('personnel')
					.select('group_id')
					.eq('id', entry.personnel_id)
					.single();
				await requireGroupAccess(event.locals.supabase, orgId!, userId, person?.group_id ?? null);
			}
		}
	}

	return originalDELETE(event);
};
```

**Step 2: Run type check**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/api/availability/+server.ts
git commit -m "feat: enforce group scope on calendar availability edits"
```

### Task 7: Add Group Scope Checks to Personnel API

**Files:**
- Modify: `src/routes/org/[orgId]/api/personnel/+server.ts`

**Step 1: Add group scope enforcement**

Import `requireGroupAccess` and `getScopedGroupId` at the top:

```typescript
import { requireGroupAccess, getScopedGroupId } from '$lib/server/permissions';
```

In the POST handler, after the permission check, enforce that group-scoped members can only add personnel to their group:

```typescript
// After requireEditPermission check
if (!isSandbox && userId) {
	const scopedGroupId = await getScopedGroupId(supabase, orgId, userId);
	if (scopedGroupId && body.groupId !== scopedGroupId) {
		return json({ error: 'You can only add personnel to your assigned group' }, { status: 403 });
	}
}
```

In the PUT handler, check that the target personnel belongs to the user's group:

```typescript
if (!isSandbox && userId) {
	const { data: person } = await supabase.from('personnel').select('group_id').eq('id', id).single();
	await requireGroupAccess(supabase, orgId, userId, person?.group_id ?? null);
}
```

In the DELETE handler, same check:

```typescript
if (!isSandbox && userId) {
	// existing already fetches person for audit — use that
	await requireGroupAccess(supabase, orgId, userId, existing?.group_id ?? null);
}
```

Note: Adjust the existing `select` for the pre-delete fetch to include `group_id` alongside `rank, first_name, last_name`.

**Step 2: Run type check**

Run: `npm run check`

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/api/personnel/+server.ts
git commit -m "feat: enforce group scope on personnel create/update/delete"
```

### Task 8: Add Group Scope Checks to Personnel-Related CRUD Endpoints

**Files:**
- Modify: `src/lib/server/crudFactory.ts`

Rather than modifying every individual endpoint, add group scope support to the crudFactory itself. This covers counseling records, development goals, personnel extended info, and personnel trainings.

**Step 1: Add `personnelIdField` config option**

Add to `CrudConfig`:
```typescript
/** If set, the DB column that contains the personnel_id for group scope enforcement */
personnelIdField?: string;
```

**Step 2: Add scope check logic in POST, PUT, and DELETE**

After the `requireEditPermission` call in each handler, add:

```typescript
if (config.personnelIdField && !isSandbox && userId) {
	const { getScopedGroupId } = await import('./permissions');
	const scopedGroupId = await getScopedGroupId(supabase, orgId, userId);
	if (scopedGroupId) {
		// Determine the personnel_id from the request body
		const personnelId = body[config.personnelIdField] ?? body.personnelId;
		if (personnelId) {
			const { data: person } = await supabase
				.from('personnel')
				.select('group_id')
				.eq('id', personnelId)
				.single();
			if (person && person.group_id !== scopedGroupId) {
				throw error(403, 'You do not have access to personnel outside your group');
			}
		}
	}
}
```

For PUT and DELETE, the personnel_id might be on the existing record rather than in the request body. For PUT, look it up from the existing record if not in body. For DELETE, look it up from the record being deleted (the pre-delete fetch already exists for audit).

**Step 3: Add `personnelIdField` to relevant endpoints**

Add `personnelIdField: 'personnel_id'` to:
- `src/routes/org/[orgId]/api/counseling-records/+server.ts`
- `src/routes/org/[orgId]/api/development-goals/+server.ts`
- `src/routes/org/[orgId]/api/personnel-extended-info/+server.ts`

Add `personnelIdField: 'personnel_id'` to personnel-trainings manually since it's not a crudFactory endpoint (already handled in the manual endpoint via direct checks).

**Step 4: Run type check**

Run: `npm run check`

**Step 5: Commit**

```bash
git add src/lib/server/crudFactory.ts src/routes/org/[orgId]/api/counseling-records/+server.ts src/routes/org/[orgId]/api/development-goals/+server.ts src/routes/org/[orgId]/api/personnel-extended-info/+server.ts
git commit -m "feat: add group scope enforcement to crudFactory and personnel-related endpoints"
```

---

## Phase 5: Update Settings & Member Management UI

### Task 9: Update Settings Page Server for Admin Role

**Files:**
- Modify: `src/routes/org/[orgId]/settings/+page.server.ts`

**Step 1: Update the invite action to handle admin role and scoped_group_id**

In the `invite` action, when the preset is `'admin'`, set `role: 'admin'` on the invitation (or store it separately). When preset is `'team-leader'`, include the `scoped_group_id` from the form data.

Update the invitation insert to include `scoped_group_id`:

```typescript
const scopedGroupId = preset === 'team-leader' ? formData.get('scopedGroupId') : null;

// In the insert:
const inviteData = {
	organization_id: orgId,
	email: sanitizedEmail,
	invited_by: locals.user!.id,
	can_view_calendar: permissions.canViewCalendar,
	// ... other permissions ...
	scoped_group_id: scopedGroupId || null
};
```

**Step 2: Update the updatePermissions action**

When changing a member's preset to 'admin', update their role to 'admin'. When changing from admin to a member preset, set role back to 'member'. When setting 'team-leader', update `scoped_group_id`.

```typescript
// Determine role from preset
const newRole = preset === 'admin' ? 'admin' : 'member';
const scopedGroupId = preset === 'team-leader' ? formData.get('scopedGroupId') : null;

// Update membership
const updateData = {
	role: newRole,
	can_view_calendar: permissions.canViewCalendar,
	// ... other permissions ...
	scoped_group_id: scopedGroupId || null
};
```

Important: Cannot change owner's role via updatePermissions. Keep the existing `if (member.role === 'owner')` guard.

**Step 3: Update load function to include scopedGroupId in member data**

In the members mapping, add:
```typescript
scopedGroupId: m.scoped_group_id
```

**Step 4: Update settings page access — admins can access**

The settings page should be accessible to admins. Update any `data.isOwner` checks to `data.isOwner || data.isAdmin` where appropriate (but NOT for transfer/delete sections).

**Step 5: Run type check**

Run: `npm run check`

**Step 6: Commit**

```bash
git add src/routes/org/[orgId]/settings/+page.server.ts
git commit -m "feat: update settings server for admin role and group scope in invites/permissions"
```

### Task 10: Update OrganizationMemberManager Component

**Files:**
- Modify: `src/lib/components/OrganizationMemberManager.svelte`

**Step 1: Update role badge display**

Change the role badge logic to show "Owner", "Admin", or "Member":
```svelte
{#if member.role === 'owner'}
	<Badge label="OWNER" color="#B8943E" bold />
{:else if member.role === 'admin'}
	<Badge label="ADMIN" color="#3b82f6" bold />
{:else}
	<Badge label="MEMBER" color="#6b7280" />
{/if}
```

**Step 2: Add group scope display**

When a member has a `scopedGroupId`, show the group name next to their role:
```svelte
{#if member.scopedGroupId}
	<span class="scope-label">{groups.find(g => g.id === member.scopedGroupId)?.name ?? 'Unknown group'}</span>
{/if}
```

**Step 3: Add team-leader preset to the preset selector**

Add the option in the preset select dropdown and show a group picker when 'team-leader' is selected:

```svelte
<option value="team-leader">Team Leader (group-scoped)</option>
```

When 'team-leader' or 'custom' is selected and user wants group scoping:
```svelte
{#if selectedPreset === 'team-leader' || selectedPreset === 'custom'}
	<select name="scopedGroupId" class="select">
		<option value="">Org-wide (no group scope)</option>
		{#each groups as group}
			<option value={group.id}>{group.name}</option>
		{/each}
	</select>
{/if}
```

**Step 4: Update the invite form**

Add team-leader option and group picker to the invite form as well.

**Step 5: Cannot change owner or admin permissions unless you are owner**

Update the guard: admins can change member permissions but not other admins or owners. Only owners can change admin roles.

**Step 6: Props update**

Add `groups` and `isAdmin` to the component props:
```typescript
interface Props {
	members: OrganizationMember[];
	invitations: OrganizationInvitation[];
	isOwner: boolean;
	isAdmin: boolean;
	canManageMembers: boolean;
	groups: Group[];
}
```

**Step 7: Run type check**

Run: `npm run check`

**Step 8: Commit**

```bash
git add src/lib/components/OrganizationMemberManager.svelte
git commit -m "feat: update member manager UI for admin role, team leader preset, and group scope"
```

### Task 11: Update Settings Page Template

**Files:**
- Modify: `src/routes/org/[orgId]/settings/+page.svelte`

**Step 1: Gate settings sections for admins**

Update permission checks so admins can see settings:
- Org name: `data.isOwner || data.isAdmin`
- Data export: `data.isOwner || data.isAdmin || data.permissions.canManageMembers`
- Billing: `data.isOwner || data.isAdmin`
- Danger zone (transfer/delete): `data.isOwner` only (unchanged)

**Step 2: Pass new props to OrganizationMemberManager**

```svelte
<OrganizationMemberManager
	members={data.members}
	invitations={data.invitations}
	isOwner={data.isOwner}
	isAdmin={data.isAdmin}
	canManageMembers={data.permissions.canManageMembers}
	groups={data.groups}
/>
```

**Step 3: Run type check**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/routes/org/[orgId]/settings/+page.svelte
git commit -m "feat: update settings page for admin access and group scope UI"
```

---

## Phase 6: Update Audit Log Access & Avatar Menu

### Task 12: Update Audit Log Access for Admins

**Files:**
- Modify: `src/routes/org/[orgId]/audit/+page.server.ts`
- Modify: `src/lib/components/ui/AvatarMenu.svelte`

**Step 1: Allow admins to view org audit log**

In `+page.server.ts`, change the guard:
```typescript
if (userRole !== 'owner' && userRole !== 'admin') {
	throw error(403, 'Only organization owners and admins can view audit logs');
}
```

**Step 2: Show audit log link for admins in avatar menu**

In `AvatarMenu.svelte`, update the condition:
```typescript
if (userRole === 'owner' || userRole === 'admin') {
	result.push({ label: 'Audit Log', href: `/org/${orgId}/audit` });
}
```

Also update the Org Settings link visibility:
```typescript
result.push({ label: 'Org Settings', href: `/org/${orgId}/settings` });
// This should be visible to anyone with canManageMembers or owner/admin role
```

**Step 3: Run type check**

Run: `npm run check`

**Step 4: Commit**

```bash
git add src/routes/org/[orgId]/audit/+page.server.ts src/lib/components/ui/AvatarMenu.svelte
git commit -m "feat: allow admins to view audit logs and org settings"
```

---

## Phase 7: Update Invitation Acceptance Flow

### Task 13: Handle Admin Role and Group Scope in Invitation Acceptance

**Files:**
- Search for the invitation acceptance code (likely in `src/routes/auth/callback/` or a webhook handler)

**Step 1: Find and update the invitation acceptance flow**

When an invitation is accepted, the new membership should inherit:
- The `scoped_group_id` from the invitation
- If the invitation preset was 'admin', set `role = 'admin'` instead of 'member'

Search for where `organization_memberships` INSERT happens during invitation acceptance and ensure `scoped_group_id` and the correct role are carried over.

**Step 2: Run type check**

Run: `npm run check`

**Step 3: Commit**

```bash
git commit -m "feat: carry admin role and group scope through invitation acceptance"
```

---

## Phase 8: Full Build Verification & Memory Update

### Task 14: Full Build Verification

**Step 1: Run full type check**

Run: `npm run check`
Expected: 0 errors (warnings OK)

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Manual smoke test checklist**

- [ ] Existing owner can still access everything
- [ ] Can invite someone as admin — they get full access + audit log
- [ ] Can invite someone as team leader with a group — they only see their group on personnel/training/leaders-book
- [ ] Team leader can see full calendar but only edit their group's availability
- [ ] Admin can access settings, manage members, view audit logs
- [ ] Admin CANNOT transfer ownership or delete org
- [ ] Removing a group that a member is scoped to → member becomes org-wide

### Task 15: Update Claude Memory

**Files:**
- Modify: `/Users/robertbaddeley/.claude/projects/-Users-robertbaddeley-projects-trooptotask/memory/MEMORY.md`

**Step 1: Add permission system documentation to memory**

Add a section documenting the permission model so all future features respect it:

```markdown
## Permission System (redesigned 2026-03-08)
- **Roles:** owner > admin > member (DB enum `organization_role`)
- **Owner:** Full access + destructive ops (transfer, delete org)
- **Admin:** Full access + audit logs + settings, but no transfer/delete
- **Member:** Access controlled by 7 boolean flags (canView/EditCalendar, canView/EditPersonnel, canView/EditTraining, canManageMembers)
- **Group Scoping:** Members can optionally have `scoped_group_id` (nullable FK to groups)
  - NULL = org-wide access (default)
  - Set = only see/edit personnel in that group
  - Calendar is always org-wide visibility; calendar editing respects scope
  - Owners and admins are always org-wide (scope ignored)
- **Presets:** admin, full-editor, team-leader (scoped), calendar-only, personnel-only, training-only, viewer, custom
- **RULES for new features:**
  - Use `isPrivilegedRole(role)` (owner OR admin) instead of checking just owner
  - All personnel-related queries must respect `scopedGroupId` from layout
  - All personnel-related API mutations must call `requireGroupAccess()` for group-scoped enforcement
  - Gate admin-level features (audit log, settings) on `role === 'owner' || role === 'admin'`
  - Gate destructive ops (transfer, delete) on `role === 'owner'` only
```

**Step 2: Commit**

```bash
git commit -m "docs: update Claude memory with permission system documentation"
```
