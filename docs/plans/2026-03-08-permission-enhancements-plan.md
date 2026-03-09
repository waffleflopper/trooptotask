# Permission Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add onboarding/leader's book permissions, deletion approval workflow, notification system, and admin hub — building on the existing permission redesign.

**Architecture:** New DB columns for onboarding/leaders-book permissions flow through the existing layout→page→API permission pipeline. Deletion approvals use a new `deletion_requests` table with a request/review flow. Notifications use a new `notifications` table with a bell icon in the header. The admin hub replaces the standalone audit page with a tabbed layout for approvals + audit.

**Tech Stack:** SvelteKit 2.5, Svelte 5 (runes), TypeScript, Supabase (Postgres), pure CSS variables

**CRITICAL:** All database migrations must be applied to the LOCAL database only:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f <migration_file>
```
NEVER use `supabase migration repair`, `supabase db reset`, or any command that connects to the remote database.

---

### Task 1: Database Migration — New Permission Columns, Tables

**Files:**
- Create: `supabase/migrations/20260308_permission_enhancements.sql`

**Step 1: Write the migration SQL**

```sql
-- Permission Enhancements Migration
-- Adds onboarding/leaders-book permission columns, deletion_requests table, notifications table

-- 1. Add new permission columns to organization_memberships
ALTER TABLE public.organization_memberships
  ADD COLUMN IF NOT EXISTS can_view_onboarding BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_onboarding BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_leaders_book BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_leaders_book BOOLEAN DEFAULT true;

-- 2. Add new permission columns to organization_invitations
ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS can_view_onboarding BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_onboarding BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_leaders_book BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_leaders_book BOOLEAN DEFAULT true;

-- 3. RLS helper functions for new permissions
CREATE OR REPLACE FUNCTION public.can_view_onboarding(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_onboarding = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_onboarding(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_onboarding = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_leaders_book(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_view_leaders_book = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_leaders_book(p_organization_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND (role IN ('owner', 'admin') OR can_edit_leaders_book = true)
  );
END;
$$;

-- 4. Deletion requests table
CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_by_email TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  resource_description TEXT NOT NULL,
  resource_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  denial_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_org_status ON public.deletion_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON public.deletion_requests(requested_by);

-- RLS for deletion_requests
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own deletion requests"
  ON public.deletion_requests FOR SELECT
  USING (requested_by = auth.uid());

CREATE POLICY "Admins can view all org deletion requests"
  ON public.deletion_requests FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Members can insert own deletion requests"
  ON public.deletion_requests FOR INSERT
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Members can delete own pending requests"
  ON public.deletion_requests FOR DELETE
  USING (requested_by = auth.uid() AND status = 'pending');

CREATE POLICY "Admins can update org deletion requests"
  ON public.deletion_requests FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- 5. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_org ON public.notifications(user_id, organization_id);

-- RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());
```

**Step 2: Apply migration to LOCAL database**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260308_permission_enhancements.sql
```

Expected: All statements succeed (ALTER TABLE, CREATE FUNCTION, CREATE TABLE, CREATE INDEX, CREATE POLICY).

**Step 3: Commit**

```bash
git add supabase/migrations/20260308_permission_enhancements.sql
git commit -m "feat: add permission enhancement migration — onboarding/leaders-book columns, deletion_requests, notifications tables"
```

---

### Task 2: TypeScript Types & Presets Update

**Files:**
- Modify: `src/lib/types.ts` (lines 16-140)

**Step 1: Update OrganizationMemberPermissions interface**

At `src/lib/types.ts:16-24`, change the interface to add four new fields:

```typescript
export interface OrganizationMemberPermissions {
	canViewCalendar: boolean;
	canEditCalendar: boolean;
	canViewPersonnel: boolean;
	canEditPersonnel: boolean;
	canViewTraining: boolean;
	canEditTraining: boolean;
	canViewOnboarding: boolean;
	canEditOnboarding: boolean;
	canViewLeadersBook: boolean;
	canEditLeadersBook: boolean;
	canManageMembers: boolean;
}
```

**Step 2: Update PermissionPreset type**

At `src/lib/types.ts:47-56`, remove the three presets:

```typescript
export type PermissionPreset =
	| 'owner'
	| 'admin'
	| 'full-editor'
	| 'team-leader'
	| 'viewer'
	| 'custom';
```

**Step 3: Update PERMISSION_PRESETS constant**

At `src/lib/types.ts:58-122`, replace with (removing calendar-only, personnel-only, training-only, adding new fields):

```typescript
export const PERMISSION_PRESETS: Record<Exclude<PermissionPreset, 'owner' | 'custom'>, OrganizationMemberPermissions> = {
	admin: {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: true
	},
	'full-editor': {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: false
	},
	'team-leader': {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: false
	},
	viewer: {
		canViewCalendar: true,
		canEditCalendar: false,
		canViewPersonnel: true,
		canEditPersonnel: false,
		canViewTraining: true,
		canEditTraining: false,
		canViewOnboarding: true,
		canEditOnboarding: false,
		canViewLeadersBook: true,
		canEditLeadersBook: false,
		canManageMembers: false
	}
};
```

**Step 4: Update getPermissionPreset function**

At `src/lib/types.ts:124-140`, add checks for the four new fields:

```typescript
export function getPermissionPreset(permissions: OrganizationMemberPermissions): PermissionPreset {
	for (const [preset, presetPermissions] of Object.entries(PERMISSION_PRESETS)) {
		if (
			permissions.canViewCalendar === presetPermissions.canViewCalendar &&
			permissions.canEditCalendar === presetPermissions.canEditCalendar &&
			permissions.canViewPersonnel === presetPermissions.canViewPersonnel &&
			permissions.canEditPersonnel === presetPermissions.canEditPersonnel &&
			permissions.canViewTraining === presetPermissions.canViewTraining &&
			permissions.canEditTraining === presetPermissions.canEditTraining &&
			permissions.canViewOnboarding === presetPermissions.canViewOnboarding &&
			permissions.canEditOnboarding === presetPermissions.canEditOnboarding &&
			permissions.canViewLeadersBook === presetPermissions.canViewLeadersBook &&
			permissions.canEditLeadersBook === presetPermissions.canEditLeadersBook &&
			permissions.canManageMembers === presetPermissions.canManageMembers
		) {
			return preset as PermissionPreset;
		}
	}
	return 'custom';
}
```

**Step 5: Add isFullEditor helper function**

After the `getPermissionPreset` function, add:

```typescript
export function isFullEditor(permissions: OrganizationMemberPermissions): boolean {
	return (
		permissions.canViewCalendar && permissions.canEditCalendar &&
		permissions.canViewPersonnel && permissions.canEditPersonnel &&
		permissions.canViewTraining && permissions.canEditTraining &&
		permissions.canViewOnboarding && permissions.canEditOnboarding &&
		permissions.canViewLeadersBook && permissions.canEditLeadersBook &&
		permissions.canManageMembers
	);
}
```

**Step 6: Verify build**

```bash
npm run check 2>&1 | head -50
```

Expected: New type errors in files that use `OrganizationMemberPermissions` without the new fields (these will be fixed in subsequent tasks).

**Step 7: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: update permission types — add onboarding/leaders-book fields, remove single-section presets, add isFullEditor helper"
```

---

### Task 3: Update Server Permissions Module

**Files:**
- Modify: `src/lib/server/permissions.ts`

**Step 1: Update PermissionType and MembershipPermissions**

At `src/lib/server/permissions.ts:4`, update the type:

```typescript
export type PermissionType = 'calendar' | 'personnel' | 'training' | 'onboarding' | 'leaders-book';
```

At `src/lib/server/permissions.ts:6-12`, update the interface:

```typescript
interface MembershipPermissions {
	role: 'owner' | 'admin' | 'member';
	can_edit_calendar: boolean;
	can_edit_personnel: boolean;
	can_edit_training: boolean;
	can_edit_onboarding: boolean;
	can_edit_leaders_book: boolean;
	scoped_group_id: string | null;
}
```

**Step 2: Update getMembershipPermissions select**

At `src/lib/server/permissions.ts:23-25`, update the select:

```typescript
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role, can_edit_calendar, can_edit_personnel, can_edit_training, can_edit_onboarding, can_edit_leaders_book, scoped_group_id')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();
```

**Step 3: Add cases to requireEditPermission switch**

At `src/lib/server/permissions.ts:51-67`, add two new cases after the training case:

```typescript
		case 'onboarding':
			if (!membership.can_edit_onboarding) {
				throw error(403, 'You do not have permission to edit onboarding data');
			}
			break;
		case 'leaders-book':
			if (!membership.can_edit_leaders_book) {
				throw error(403, 'You do not have permission to edit leader\'s book data');
			}
			break;
```

**Step 4: Export isPrivilegedRole and add requirePrivilegedOrFullEditor**

Make `isPrivilegedRole` exported (line 14):

```typescript
export function isPrivilegedRole(role: string): boolean {
	return role === 'owner' || role === 'admin';
}
```

Add a new function after `requireGroupAccess`:

```typescript
export async function requirePrivilegedOrFullEditor(
	supabase: SupabaseClient,
	orgId: string,
	userId: string
): Promise<void> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership) {
		throw error(403, 'Not a member of this organization');
	}

	if (isPrivilegedRole(membership.role)) return;

	// Check if full editor (all permissions true)
	const isFullEd = membership.can_view_calendar && membership.can_edit_calendar &&
		membership.can_view_personnel && membership.can_edit_personnel &&
		membership.can_view_training && membership.can_edit_training &&
		membership.can_view_onboarding && membership.can_edit_onboarding &&
		membership.can_view_leaders_book && membership.can_edit_leaders_book &&
		membership.can_manage_members;

	if (!isFullEd) {
		throw error(403, 'This action requires full editor, admin, or owner permissions');
	}
}
```

**Step 5: Commit**

```bash
git add src/lib/server/permissions.ts
git commit -m "feat: update permissions module — add onboarding/leaders-book types, requirePrivilegedOrFullEditor helper"
```

---

### Task 4: Update Layout Server — Load New Permissions & isFullEditor

**Files:**
- Modify: `src/routes/org/[orgId]/+layout.server.ts`

**Step 1: Update membership select**

At `src/routes/org/[orgId]/+layout.server.ts:156-157`, update the select to include new columns:

```typescript
		'role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members, scoped_group_id'
```

**Step 2: Update permissions object**

At `src/routes/org/[orgId]/+layout.server.ts:188-196`, add the new fields:

```typescript
	const permissions: OrganizationMemberPermissions = {
		canViewCalendar: isPrivileged || membership.can_view_calendar,
		canEditCalendar: isPrivileged || membership.can_edit_calendar,
		canViewPersonnel: isPrivileged || membership.can_view_personnel,
		canEditPersonnel: isPrivileged || membership.can_edit_personnel,
		canViewTraining: isPrivileged || membership.can_view_training,
		canEditTraining: isPrivileged || membership.can_edit_training,
		canViewOnboarding: isPrivileged || membership.can_view_onboarding,
		canEditOnboarding: isPrivileged || membership.can_edit_onboarding,
		canViewLeadersBook: isPrivileged || membership.can_view_leaders_book,
		canEditLeadersBook: isPrivileged || membership.can_edit_leaders_book,
		canManageMembers: isPrivileged || membership.can_manage_members
	};
```

**Step 3: Add isFullEditor computation**

After the permissions object (after line 196), add:

```typescript
	const isFullEditor = !isPrivileged && (
		permissions.canViewCalendar && permissions.canEditCalendar &&
		permissions.canViewPersonnel && permissions.canEditPersonnel &&
		permissions.canViewTraining && permissions.canEditTraining &&
		permissions.canViewOnboarding && permissions.canEditOnboarding &&
		permissions.canViewLeadersBook && permissions.canEditLeadersBook &&
		permissions.canManageMembers
	);
```

**Step 4: Add unread notification count**

After the `isFullEditor` computation, add:

```typescript
	// Get unread notification count
	const { count: unreadNotificationCount } = await locals.supabase
		.from('notifications')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', user.id)
		.eq('organization_id', orgId)
		.eq('read', false);
```

**Step 5: Update return object**

At `src/routes/org/[orgId]/+layout.server.ts:213-232`, add to the return:

```typescript
		isFullEditor,
		unreadNotificationCount: unreadNotificationCount ?? 0,
```

**Step 6: Update demo mode permission objects**

At lines 74-82 (read-only demo), add the new fields:

```typescript
		const readOnlyPermissions: OrganizationMemberPermissions = {
			canViewCalendar: true,
			canEditCalendar: false,
			canViewPersonnel: true,
			canEditPersonnel: false,
			canViewTraining: true,
			canEditTraining: false,
			canViewOnboarding: true,
			canEditOnboarding: false,
			canViewLeadersBook: true,
			canEditLeadersBook: false,
			canManageMembers: false
		};
```

And add to that return: `isFullEditor: false, unreadNotificationCount: 0,`

At lines 112-120 (sandbox demo), add the new fields:

```typescript
		const fullPermissions: OrganizationMemberPermissions = {
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: true
		};
```

And add to that return: `isFullEditor: true, unreadNotificationCount: 0,`

**Step 7: Commit**

```bash
git add src/routes/org/[orgId]/+layout.server.ts
git commit -m "feat: layout server — load new permissions, isFullEditor, unread notification count"
```

---

### Task 5: Fix Team Leader Group Dropdown & Update Member Manager UI

**Files:**
- Modify: `src/lib/components/OrganizationMemberManager.svelte`

**Step 1: Remove old presets from presetOptions**

At `src/lib/components/OrganizationMemberManager.svelte:72-80`, replace with:

```typescript
	const presetOptions: { value: Exclude<PermissionPreset, 'owner' | 'custom'>; label: string }[] = [
		{ value: 'admin', label: 'Admin' },
		{ value: 'full-editor', label: 'Full Editor' },
		{ value: 'team-leader', label: 'Team Leader' },
		{ value: 'viewer', label: 'Viewer' }
	];
```

**Step 2: Remove old preset labels**

At `src/lib/components/OrganizationMemberManager.svelte:87-108`, replace getPresetLabel to remove the three dropped presets:

```typescript
	function getPresetLabel(preset: PermissionPreset): string {
		switch (preset) {
			case 'owner': return 'Owner';
			case 'admin': return 'Admin';
			case 'full-editor': return 'Full Editor';
			case 'viewer': return 'Viewer';
			case 'team-leader': return 'Team Leader';
			case 'custom': return 'Custom';
		}
	}
```

**Step 3: Fix team leader dropdown bug — track selected preset per member**

Add state to track selected presets at line 70 (after `inviteScopedGroupId`):

```typescript
	let memberSelectedPreset = $state<Record<string, string>>({});
```

Update `getMemberPreset` usage to also add the new permission fields (line 110-121). Update the function to include new fields:

```typescript
	function getMemberPreset(member: OrganizationMember): PermissionPreset {
		if (member.role === 'owner') return 'owner';
		return getPermissionPreset({
			canViewCalendar: member.canViewCalendar,
			canEditCalendar: member.canEditCalendar,
			canViewPersonnel: member.canViewPersonnel,
			canEditPersonnel: member.canEditPersonnel,
			canViewTraining: member.canViewTraining,
			canEditTraining: member.canEditTraining,
			canViewOnboarding: member.canViewOnboarding,
			canEditOnboarding: member.canEditOnboarding,
			canViewLeadersBook: member.canViewLeadersBook,
			canEditLeadersBook: member.canEditLeadersBook,
			canManageMembers: member.canManageMembers
		});
	}
```

Similarly update `getInvitePreset` (line 132-142) with new fields.

**Step 4: Update the preset select onchange handler**

At line 201-209, update to track selected preset:

```typescript
									onchange={(e) => {
										const val = e.currentTarget.value;
										memberSelectedPreset = { ...memberSelectedPreset, [member.id]: val };
										handlePresetChange(member.id, val);
										if (val === 'custom' || val === 'team-leader') {
											expandedMemberId = member.id;
										} else {
											e.currentTarget.form?.requestSubmit();
										}
									}}
```

**Step 5: Fix group dropdown condition**

At line 218, change the condition to use the selected preset:

```typescript
								{#if (memberSelectedPreset[member.id] === 'team-leader' || (preset === 'team-leader' && !memberSelectedPreset[member.id])) && expandedMemberId === member.id}
```

**Step 6: Add Onboarding and Leader's Book to custom permission grid**

At line 286-357 (the permission-grid), add two new sections after the Training section:

```svelte
							<div class="permission-section">
								<h4>Onboarding</h4>
								<label class="checkbox-label">
									<input
										type="checkbox"
										name="canViewOnboarding"
										checked={member.canViewOnboarding}
									/>
									View
								</label>
								<label class="checkbox-label">
									<input
										type="checkbox"
										name="canEditOnboarding"
										checked={member.canEditOnboarding}
									/>
									Edit
								</label>
							</div>

							<div class="permission-section">
								<h4>Leader's Book</h4>
								<label class="checkbox-label">
									<input
										type="checkbox"
										name="canViewLeadersBook"
										checked={member.canViewLeadersBook}
									/>
									View
								</label>
								<label class="checkbox-label">
									<input
										type="checkbox"
										name="canEditLeadersBook"
										checked={member.canEditLeadersBook}
									/>
									Edit
								</label>
							</div>
```

**Step 7: Commit**

```bash
git add src/lib/components/OrganizationMemberManager.svelte
git commit -m "fix: team leader group dropdown, remove unused presets, add onboarding/leaders-book permission checkboxes"
```

---

### Task 6: Update Settings Server — Invite & UpdatePermissions Actions

**Files:**
- Modify: `src/routes/org/[orgId]/settings/+page.server.ts`

**Step 1: Update invite action**

In the `invite` action, the invitation insert (around lines 158-170) needs the new permission fields added. When building the invitation record from the preset permissions, add:

```typescript
					can_view_onboarding: permissions.canViewOnboarding,
					can_edit_onboarding: permissions.canEditOnboarding,
					can_view_leaders_book: permissions.canViewLeadersBook,
					can_edit_leaders_book: permissions.canEditLeadersBook,
```

**Step 2: Update load function — return invitations with new fields**

In the load function where invitations are selected, add the new columns to the select query. The invitations select should include `can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book`.

And map them in the returned invitation objects:

```typescript
canViewOnboarding: inv.can_view_onboarding,
canEditOnboarding: inv.can_edit_onboarding,
canViewLeadersBook: inv.can_view_leaders_book,
canEditLeadersBook: inv.can_edit_leaders_book,
```

**Step 3: Update updatePermissions action**

In the `updatePermissions` action (around lines 288-323), when building the permissions update object from custom checkboxes, add:

```typescript
				can_view_onboarding: formData.get('canViewOnboarding') === 'on',
				can_edit_onboarding: formData.get('canEditOnboarding') === 'on',
				can_view_leaders_book: formData.get('canViewLeadersBook') === 'on',
				can_edit_leaders_book: formData.get('canEditLeadersBook') === 'on',
```

When building from a preset, add:

```typescript
				can_view_onboarding: presetPerms.canViewOnboarding,
				can_edit_onboarding: presetPerms.canEditOnboarding,
				can_view_leaders_book: presetPerms.canViewLeadersBook,
				can_edit_leaders_book: presetPerms.canEditLeadersBook,
```

**Step 4: Update settings load function — return isFullEditor and groups**

Make sure the load function returns `isFullEditor` from the parent layout data.

**Step 5: Commit**

```bash
git add src/routes/org/[orgId]/settings/+page.server.ts
git commit -m "feat: settings server — carry new permission fields through invite and updatePermissions"
```

---

### Task 7: Update Invitation Acceptance Flows

**Files:**
- Modify: `src/routes/dashboard/+page.server.ts`
- Modify: `src/routes/auth/register/+page.server.ts`

**Step 1: Update dashboard acceptInvitation**

In `src/routes/dashboard/+page.server.ts`, the `acceptInvitation` action (around lines 98-121) inserts a membership from invitation data. Add the new fields to the membership insert:

```typescript
					can_view_onboarding: invitation.can_view_onboarding ?? true,
					can_edit_onboarding: invitation.can_edit_onboarding ?? true,
					can_view_leaders_book: invitation.can_view_leaders_book ?? true,
					can_edit_leaders_book: invitation.can_edit_leaders_book ?? true,
```

Also update the `isAdminInvite` detection to include the new fields:

```typescript
		const isAdminInvite =
			invitation.can_view_calendar && invitation.can_edit_calendar &&
			invitation.can_view_personnel && invitation.can_edit_personnel &&
			invitation.can_view_training && invitation.can_edit_training &&
			invitation.can_view_onboarding && invitation.can_edit_onboarding &&
			invitation.can_view_leaders_book && invitation.can_edit_leaders_book &&
			invitation.can_manage_members;
```

**Step 2: Update register auto-accept**

In `src/routes/auth/register/+page.server.ts`, the auto-accept flow (around lines 83-118) does the same thing. Update the invitation select to include new columns:

```typescript
				.select('organization_id, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members, scoped_group_id')
```

Update the `isAdminInvite` detection and membership insert to include the new fields (same pattern as dashboard).

**Step 3: Commit**

```bash
git add src/routes/dashboard/+page.server.ts src/routes/auth/register/+page.server.ts
git commit -m "feat: carry new permission fields through invitation acceptance flows"
```

---

### Task 8: Page-Level Permission Enforcement

**Files:**
- Modify: `src/routes/org/[orgId]/onboarding/+page.svelte`
- Modify: `src/routes/org/[orgId]/leaders-book/+page.svelte`
- Modify: `src/routes/org/[orgId]/calendar/+page.svelte`
- Modify: `src/routes/org/[orgId]/training/+page.svelte`
- Modify: `src/routes/org/[orgId]/personnel/+page.svelte`

**Step 1: Add "no permission" message component pattern**

In each page, when the user doesn't have view permission for that section, show a message instead of the page content. The pattern is:

```svelte
{#if !data.permissions.canViewXxx}
	<div class="no-permission">
		<h2>Access Restricted</h2>
		<p>You don't have permission to view this area. Contact your organization admin for access.</p>
	</div>
{:else}
	<!-- existing page content -->
{/if}
```

With CSS:
```css
.no-permission {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	min-height: 300px;
	text-align: center;
	color: var(--color-text-muted);
}
.no-permission h2 {
	font-size: var(--font-size-lg);
	margin-bottom: var(--spacing-sm);
	color: var(--color-text);
}
```

**Step 2: Apply to each page**

- **Calendar** (`+page.svelte`): Wrap content in `{#if data.permissions.canViewCalendar}` check
- **Personnel** (`+page.svelte`): Wrap content in `{#if data.permissions.canViewPersonnel}` check
- **Training** (`+page.svelte`): Wrap content in `{#if data.permissions.canViewTraining}` check
- **Onboarding** (`+page.svelte`): Change permission check from `canEditPersonnel` to `canViewOnboarding` for viewing, `canEditOnboarding` for editing
- **Leader's Book** (`+page.svelte`): Change permission check from `canEditPersonnel` to `canViewLeadersBook` for viewing, `canEditLeadersBook` for editing

**Step 3: Update onboarding API routes**

Change the permission type in onboarding API routes from `'personnel'` to `'onboarding'`:
- `src/routes/org/[orgId]/api/onboarding/+server.ts` — change `requireEditPermission(supabase, orgId, userId!, 'personnel')` to `'onboarding'`
- `src/routes/org/[orgId]/api/onboarding-template/+server.ts` — same change
- `src/routes/org/[orgId]/api/onboarding-progress/+server.ts` — same change

**Step 4: Update leader's book API routes**

Change permission type for leader's book CRUD endpoints from `'personnel'` to `'leaders-book'`:
- `src/routes/org/[orgId]/api/counseling-records/+server.ts` — change permission to `'leaders-book'`
- `src/routes/org/[orgId]/api/development-goals/+server.ts` — change permission to `'leaders-book'`
- `src/routes/org/[orgId]/api/personnel-extended-info/+server.ts` — change its permission check to use `'leaders-book'`

**Step 5: Commit**

```bash
git add src/routes/org/[orgId]/onboarding/ src/routes/org/[orgId]/leaders-book/ src/routes/org/[orgId]/calendar/ src/routes/org/[orgId]/training/ src/routes/org/[orgId]/personnel/ src/routes/org/[orgId]/api/onboarding/ src/routes/org/[orgId]/api/onboarding-template/ src/routes/org/[orgId]/api/onboarding-progress/ src/routes/org/[orgId]/api/counseling-records/ src/routes/org/[orgId]/api/development-goals/ src/routes/org/[orgId]/api/personnel-extended-info/
git commit -m "feat: page-level permission enforcement — no-permission messages, onboarding/leaders-book permission gating"
```

---

### Task 9: Config & Power Feature Restrictions

**Files:**
- Modify: `src/routes/org/[orgId]/calendar/+page.svelte`
- Modify: `src/routes/org/[orgId]/training/+page.svelte`
- Modify: `src/routes/org/[orgId]/leaders-book/+page.svelte`
- Modify: `src/routes/org/[orgId]/onboarding/+page.svelte`
- Modify: `src/routes/org/[orgId]/api/status-types/+server.ts`
- Modify: `src/routes/org/[orgId]/api/assignment-types/+server.ts`
- Modify: `src/routes/org/[orgId]/api/training-types/+server.ts`
- Modify: `src/routes/org/[orgId]/api/counseling-types/+server.ts`
- Modify: `src/routes/org/[orgId]/api/onboarding-template/+server.ts`

**Step 1: Gate config managers in calendar page**

In `src/routes/org/[orgId]/calendar/+page.svelte`, the overflow menu items for config management (around lines 195-198) should only show for full-editor/admin/owner. Add condition:

```typescript
	const canManageConfig = $derived(data.isOwner || data.isAdmin || data.isFullEditor);
```

Then wrap the config items:
```typescript
	if (canManageConfig) {
		items.push({ label: 'Status Types', onclick: () => (showStatusManager = true), divider: true, group: 'Configure', disabled: readOnly });
		items.push({ label: 'Assignment Types', onclick: () => (showAssignmentTypeManager = true), disabled: readOnly });
		items.push({ label: 'Holidays', onclick: () => (showSpecialDayManager = true), disabled: readOnly });
	}
```

Also gate BulkStatusModal, DutyRosterGenerator, MonthlyAssignmentPlanner behind `canManageConfig`:
```typescript
	if (data.permissions.canEditCalendar && canManageConfig) {
		items.push({ label: 'Assignments', ... });
		items.push({ label: 'Bulk Status', ... });
		items.push({ label: 'Duty Roster', ... });
	}
```

**Step 2: Gate config managers in training page**

In `src/routes/org/[orgId]/training/+page.svelte`, the "Manage Types" and "Reorder Columns" items should check `canManageConfig`:

```typescript
	const canManageConfig = $derived(data.isOwner || data.isAdmin || data.isFullEditor);
```

**Step 3: Gate config managers in leaders-book and onboarding pages**

Same pattern — CounselingTypeManager and OnboardingTemplateManager buttons gated by `canManageConfig`.

**Step 4: Update type-management API routes**

In each type-management API route, replace `requireEditPermission` with `requirePrivilegedOrFullEditor` for the POST/PUT/DELETE handlers:

- `src/routes/org/[orgId]/api/status-types/+server.ts`
- `src/routes/org/[orgId]/api/assignment-types/+server.ts`
- `src/routes/org/[orgId]/api/training-types/+server.ts`
- `src/routes/org/[orgId]/api/counseling-types/+server.ts`
- `src/routes/org/[orgId]/api/onboarding-template/+server.ts`

For each, the crudFactory config needs a custom permission check. Since crudFactory uses `requireEditPermission`, we need to either:
- Add a `requireFullEditor` option to the crudFactory config, OR
- Override the handlers for these specific routes

The simpler approach: add an optional `requireFullEditor: boolean` flag to crudFactory's `CrudConfig`. When true, call `requirePrivilegedOrFullEditor` instead of `requireEditPermission`.

**Step 5: Commit**

```bash
git add src/routes/org/[orgId]/calendar/ src/routes/org/[orgId]/training/ src/routes/org/[orgId]/leaders-book/ src/routes/org/[orgId]/onboarding/ src/routes/org/[orgId]/api/status-types/ src/routes/org/[orgId]/api/assignment-types/ src/routes/org/[orgId]/api/training-types/ src/routes/org/[orgId]/api/counseling-types/ src/routes/org/[orgId]/api/onboarding-template/ src/lib/server/crudFactory.ts
git commit -m "feat: restrict config managers and power features to full-editor/admin/owner"
```

---

### Task 10: Deletion Requests API

**Files:**
- Create: `src/routes/org/[orgId]/api/deletion-requests/+server.ts`
- Create: `src/routes/org/[orgId]/api/deletion-requests/review/+server.ts`

**Step 1: Create deletion requests CRUD endpoint**

```typescript
// src/routes/org/[orgId]/api/deletion-requests/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { auditLog } from '$lib/server/auditLog';

// GET: List deletion requests (admins see all for org, members see their own)
export const GET: RequestHandler = async ({ params, locals, cookies, url }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	const status = url.searchParams.get('status'); // 'pending', 'approved', 'denied', or null for all

	let query = supabase
		.from('deletion_requests')
		.select('*')
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false });

	if (status) {
		query = query.eq('status', status);
	}

	// Non-privileged users only see their own
	if (!isSandbox && userId) {
		const { data: membership } = await supabase
			.from('organization_memberships')
			.select('role')
			.eq('organization_id', orgId)
			.eq('user_id', userId)
			.single();

		if (!membership) throw error(403, 'Not a member');
		if (membership.role !== 'owner' && membership.role !== 'admin') {
			query = query.eq('requested_by', userId);
		}
	}

	const { data, error: dbError } = await query;
	if (dbError) throw error(500, dbError.message);

	return json(data ?? []);
};

// POST: Create a deletion request
export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!userId) throw error(401, 'Authentication required');

	const body = await request.json();
	const { resourceType, resourceId, resourceDescription, resourceUrl } = body;

	if (!resourceType || !resourceId || !resourceDescription) {
		throw error(400, 'Missing required fields');
	}

	// Check for existing pending request
	const { data: existing } = await supabase
		.from('deletion_requests')
		.select('id')
		.eq('organization_id', orgId)
		.eq('resource_type', resourceType)
		.eq('resource_id', resourceId)
		.eq('status', 'pending')
		.single();

	if (existing) {
		throw error(409, 'A deletion request already exists for this resource');
	}

	const { data, error: dbError } = await supabase
		.from('deletion_requests')
		.insert({
			organization_id: orgId,
			requested_by: userId,
			requested_by_email: locals.user?.email ?? 'unknown',
			resource_type: resourceType,
			resource_id: resourceId,
			resource_description: resourceDescription,
			resource_url: resourceUrl ?? null,
			status: 'pending'
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{ action: 'deletion_request.created', resourceType: 'deletion_request', resourceId: data.id, orgId, details: { actor: locals.user?.email, resource_type: resourceType, resource_description: resourceDescription } },
		{ userId }
	);

	return json(data, { status: 201 });
};

// DELETE: Cancel own pending deletion request
export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId } = getApiContext(locals, cookies, orgId);

	if (!userId) throw error(401, 'Authentication required');

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await supabase
		.from('deletion_requests')
		.delete()
		.eq('id', id)
		.eq('requested_by', userId)
		.eq('status', 'pending')
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	auditLog(
		{ action: 'deletion_request.cancelled', resourceType: 'deletion_request', resourceId: id, orgId, details: { actor: locals.user?.email } },
		{ userId }
	);

	return json({ success: true });
};
```

**Step 2: Create review endpoint**

```typescript
// src/routes/org/[orgId]/api/deletion-requests/review/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { isPrivilegedRole } from '$lib/server/permissions';
import { auditLog } from '$lib/server/auditLog';
import { getAdminClient } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId } = getApiContext(locals, cookies, orgId);

	if (!userId) throw error(401, 'Authentication required');

	// Verify admin/owner
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership || !isPrivilegedRole(membership.role)) {
		throw error(403, 'Only admins and owners can review deletion requests');
	}

	const body = await request.json();
	const { id, action, denialReason } = body; // action: 'approve' | 'deny'

	if (!id || !action) throw error(400, 'Missing required fields');
	if (action !== 'approve' && action !== 'deny') throw error(400, 'Invalid action');

	// Get the deletion request
	const { data: request_data, error: fetchError } = await supabase
		.from('deletion_requests')
		.select('*')
		.eq('id', id)
		.eq('organization_id', orgId)
		.eq('status', 'pending')
		.single();

	if (fetchError || !request_data) {
		throw error(404, 'Deletion request not found or already reviewed');
	}

	// Update the request status
	const { error: updateError } = await supabase
		.from('deletion_requests')
		.update({
			status: action === 'approve' ? 'approved' : 'denied',
			reviewed_by: userId,
			reviewed_at: new Date().toISOString(),
			denial_reason: action === 'deny' ? (denialReason ?? null) : null
		})
		.eq('id', id);

	if (updateError) throw error(500, updateError.message);

	// If approved, perform the actual deletion using admin client
	if (action === 'approve') {
		const adminClient = getAdminClient();
		const { error: deleteError } = await adminClient
			.from(getTableForResourceType(request_data.resource_type))
			.delete()
			.eq('id', request_data.resource_id)
			.eq('organization_id', orgId);

		if (deleteError) throw error(500, `Failed to delete resource: ${deleteError.message}`);

		auditLog(
			{ action: `${request_data.resource_type}.deleted`, resourceType: request_data.resource_type, resourceId: request_data.resource_id, orgId, details: { actor: locals.user?.email, approved_deletion: true, description: request_data.resource_description } },
			{ userId }
		);
	}

	// Create notification for the requester
	const adminClient = getAdminClient();
	await adminClient.from('notifications').insert({
		user_id: request_data.requested_by,
		organization_id: orgId,
		type: action === 'approve' ? 'deletion_approved' : 'deletion_denied',
		title: action === 'approve' ? 'Deletion Approved' : 'Deletion Denied',
		message: action === 'approve'
			? `Your request to delete "${request_data.resource_description}" was approved.`
			: `Your request to delete "${request_data.resource_description}" was denied.${denialReason ? ` Reason: ${denialReason}` : ''}`,
		link: action === 'deny' ? request_data.resource_url : null
	});

	auditLog(
		{ action: `deletion_request.${action === 'approve' ? 'approved' : 'denied'}`, resourceType: 'deletion_request', resourceId: id, orgId, details: { actor: locals.user?.email, resource_description: request_data.resource_description } },
		{ userId }
	);

	return json({ success: true });
};

function getTableForResourceType(resourceType: string): string {
	switch (resourceType) {
		case 'personnel': return 'personnel';
		case 'counseling_record': return 'counseling_records';
		case 'training_record': return 'personnel_trainings';
		case 'development_goal': return 'development_goals';
		default: throw new Error(`Unknown resource type: ${resourceType}`);
	}
}
```

**Step 3: Commit**

```bash
git add src/routes/org/[orgId]/api/deletion-requests/
git commit -m "feat: deletion requests API — create, cancel, review with notifications"
```

---

### Task 11: Integrate Deletion Approval into Existing Delete Flows

**Files:**
- Modify: `src/lib/server/crudFactory.ts`
- Modify: `src/routes/org/[orgId]/api/personnel/+server.ts`
- Modify: `src/routes/org/[orgId]/api/personnel-trainings/+server.ts`

**Step 1: Add deletion approval check to crudFactory**

In `src/lib/server/crudFactory.ts`, add an optional `requireDeletionApproval: boolean` flag to `CrudConfig`. When true and the user is not a full-editor/admin/owner, the DELETE handler returns a `{ requiresApproval: true }` response instead of deleting.

Add to config interface:

```typescript
	requireDeletionApproval?: boolean;
```

In the DELETE handler (around line 306-388), after permission checks but before the actual delete, add:

```typescript
	if (config.requireDeletionApproval && !isSandbox && userId) {
		const { data: mem } = await supabase
			.from('organization_memberships')
			.select('role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members')
			.eq('organization_id', orgId)
			.eq('user_id', userId)
			.single();

		if (mem && mem.role === 'member') {
			const allPerms = mem.can_view_calendar && mem.can_edit_calendar &&
				mem.can_view_personnel && mem.can_edit_personnel &&
				mem.can_view_training && mem.can_edit_training &&
				mem.can_view_onboarding && mem.can_edit_onboarding &&
				mem.can_view_leaders_book && mem.can_edit_leaders_book &&
				mem.can_manage_members;

			if (!allPerms) {
				return json({ requiresApproval: true }, { status: 202 });
			}
		}
	}
```

**Step 2: Enable deletion approval for relevant crudFactory consumers**

Add `requireDeletionApproval: true` to:
- `src/routes/org/[orgId]/api/counseling-records/+server.ts`
- `src/routes/org/[orgId]/api/development-goals/+server.ts`

**Step 3: Add approval check to personnel DELETE handler**

In `src/routes/org/[orgId]/api/personnel/+server.ts`, add the same approval check pattern before the actual delete.

**Step 4: Add approval check to personnel-trainings DELETE handler**

In `src/routes/org/[orgId]/api/personnel-trainings/+server.ts`, add the same check.

**Step 5: Commit**

```bash
git add src/lib/server/crudFactory.ts src/routes/org/[orgId]/api/counseling-records/ src/routes/org/[orgId]/api/development-goals/ src/routes/org/[orgId]/api/personnel/ src/routes/org/[orgId]/api/personnel-trainings/
git commit -m "feat: integrate deletion approval — crudFactory flag, personnel/training handlers"
```

---

### Task 12: Client-Side Deletion Approval UX

**Files:**
- Modify: Various page components that have delete buttons

**Step 1: Update delete handlers to handle 202 response**

In all components that call DELETE endpoints (counseling records, development goals, training records, personnel), update the delete handler to check for `requiresApproval`:

```typescript
async function handleDelete(id: string, description: string, resourceUrl: string) {
	const response = await fetch(`/org/${orgId}/api/${endpoint}`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ id })
	});

	const result = await response.json();

	if (result.requiresApproval) {
		// Create deletion request instead
		await fetch(`/org/${orgId}/api/deletion-requests`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				resourceType: 'counseling_record', // or appropriate type
				resourceId: id,
				resourceDescription: description,
				resourceUrl
			})
		});
		// Show feedback that request was submitted
		// Refresh data to show pending state
	}
}
```

**Step 2: Load pending deletion requests for current user**

In page load functions or client-side fetches, get the user's pending deletion requests to show "pending deletion" indicators on records.

**Step 3: Show pending deletion indicator**

For records that have a pending deletion request, show a visual indicator like:

```svelte
{#if pendingDeletionIds.has(record.id)}
	<Badge label="Pending Deletion" color="#f59e0b" />
	<button class="btn btn-sm btn-secondary" onclick={() => cancelDeletionRequest(record.id)}>Cancel</button>
{/if}
```

**Step 4: Commit**

```bash
git add <modified files>
git commit -m "feat: client-side deletion approval UX — pending indicators, request creation, cancel option"
```

---

### Task 13: Admin Hub — Layout & Approvals Page

**Files:**
- Create: `src/routes/org/[orgId]/admin/+layout.server.ts`
- Create: `src/routes/org/[orgId]/admin/+layout.svelte`
- Create: `src/routes/org/[orgId]/admin/+page.server.ts` (redirect to approvals)
- Create: `src/routes/org/[orgId]/admin/approvals/+page.server.ts`
- Create: `src/routes/org/[orgId]/admin/approvals/+page.svelte`

**Step 1: Create admin layout server**

```typescript
// src/routes/org/[orgId]/admin/+layout.server.ts
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { userRole } = await parent();
	if (userRole !== 'owner' && userRole !== 'admin') {
		throw error(403, 'Only organization owners and admins can access admin features');
	}
};
```

**Step 2: Create admin layout with sub-nav**

```svelte
<!-- src/routes/org/[orgId]/admin/+layout.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	let { children, data } = $props();

	const currentPath = $derived($page.url.pathname);
	const orgId = $derived($page.params.orgId);
</script>

<div class="admin-layout">
	<nav class="admin-tabs">
		<a
			href="/org/{orgId}/admin/approvals"
			class="tab"
			class:active={currentPath.includes('/approvals')}
		>
			Approvals
		</a>
		<a
			href="/org/{orgId}/admin/audit"
			class="tab"
			class:active={currentPath.includes('/audit')}
		>
			Audit Log
		</a>
	</nav>
	<div class="admin-content">
		{@render children()}
	</div>
</div>

<style>
	.admin-layout {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}
	.admin-tabs {
		display: flex;
		gap: var(--spacing-xs);
		border-bottom: 2px solid var(--color-border);
		padding-bottom: 0;
	}
	.tab {
		padding: var(--spacing-sm) var(--spacing-md);
		text-decoration: none;
		color: var(--color-text-muted);
		font-weight: 500;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		font-size: var(--font-size-sm);
	}
	.tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}
	.tab:hover:not(.active) {
		color: var(--color-text);
	}
	.admin-content {
		min-height: 400px;
	}
</style>
```

**Step 3: Create redirect from /admin to /admin/approvals**

```typescript
// src/routes/org/[orgId]/admin/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	throw redirect(303, `/org/${params.orgId}/admin/approvals`);
};
```

**Step 4: Create approvals page server**

```typescript
// src/routes/org/[orgId]/admin/approvals/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { orgId } = params;
	const statusFilter = url.searchParams.get('status') ?? 'pending';

	let query = locals.supabase
		.from('deletion_requests')
		.select('*')
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false });

	if (statusFilter !== 'all') {
		query = query.eq('status', statusFilter);
	}

	const { data: requests } = await query;

	return {
		requests: requests ?? [],
		statusFilter
	};
};
```

**Step 5: Create approvals page component**

```svelte
<!-- src/routes/org/[orgId]/admin/approvals/+page.svelte -->
<!-- Table of deletion requests with Approve/Deny buttons, status filter tabs -->
```

The approvals page should show:
- Filter tabs: Pending | Approved | Denied | All
- Table: Requester (email), Description (linked), Requested (relative date), Actions (Approve/Deny for pending)
- Deny shows a text input for optional reason
- Each row shows `resource_description` as a link to `resource_url`

**Step 6: Commit**

```bash
git add src/routes/org/[orgId]/admin/
git commit -m "feat: admin hub layout with approvals page — deletion request review, status filters"
```

---

### Task 14: Move Audit Log Under Admin Hub

**Files:**
- Create: `src/routes/org/[orgId]/admin/audit/+page.server.ts`
- Create: `src/routes/org/[orgId]/admin/audit/+page.svelte`
- Modify: `src/routes/org/[orgId]/audit/+page.server.ts` (redirect)
- Remove or redirect: `src/routes/org/[orgId]/audit/+page.svelte`

**Step 1: Move audit page server to admin/audit**

Copy the content from `src/routes/org/[orgId]/audit/+page.server.ts` to `src/routes/org/[orgId]/admin/audit/+page.server.ts`. Remove the permission check since the admin layout handles it.

**Step 2: Move audit page component**

Copy `src/routes/org/[orgId]/audit/+page.svelte` to `src/routes/org/[orgId]/admin/audit/+page.svelte`.

**Step 3: Add redirect from old audit URL**

Replace `src/routes/org/[orgId]/audit/+page.server.ts` with a redirect:

```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	throw redirect(301, `/org/${params.orgId}/admin/audit`);
};
```

Delete `src/routes/org/[orgId]/audit/+page.svelte` (no longer needed since it redirects).

**Step 4: Update AvatarMenu link**

In `src/lib/components/ui/AvatarMenu.svelte`, change the audit log link (around line 72-74):

```typescript
	if (userRole === 'owner' || userRole === 'admin') {
		result.push({ label: 'Admin', href: `/org/${orgId}/admin` });
	}
```

**Step 5: Commit**

```bash
git add src/routes/org/[orgId]/admin/audit/ src/routes/org/[orgId]/audit/ src/lib/components/ui/AvatarMenu.svelte
git commit -m "feat: move audit log under admin hub, add redirect from old URL, update avatar menu"
```

---

### Task 15: Notification Bell Component

**Files:**
- Create: `src/lib/components/ui/NotificationBell.svelte`
- Create: `src/routes/org/[orgId]/api/notifications/+server.ts`

**Step 1: Create notifications API endpoint**

```typescript
// src/routes/org/[orgId]/api/notifications/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET: List user's notifications for this org
export const GET: RequestHandler = async ({ params, locals }) => {
	const { orgId } = params;
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Authentication required');

	const { data, error: dbError } = await locals.supabase
		.from('notifications')
		.select('*')
		.eq('user_id', user.id)
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false })
		.limit(20);

	if (dbError) throw error(500, dbError.message);
	return json(data ?? []);
};

// PUT: Mark notifications as read
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const { orgId } = params;
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Authentication required');

	const body = await request.json();
	const { id, markAllRead } = body;

	if (markAllRead) {
		await locals.supabase
			.from('notifications')
			.update({ read: true })
			.eq('user_id', user.id)
			.eq('organization_id', orgId)
			.eq('read', false);
	} else if (id) {
		await locals.supabase
			.from('notifications')
			.update({ read: true })
			.eq('id', id)
			.eq('user_id', user.id);
	}

	return json({ success: true });
};

// DELETE: Dismiss a notification
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const { orgId } = params;
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Authentication required');

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	await locals.supabase
		.from('notifications')
		.delete()
		.eq('id', id)
		.eq('user_id', user.id);

	return json({ success: true });
};
```

**Step 2: Create NotificationBell component**

```svelte
<!-- src/lib/components/ui/NotificationBell.svelte -->
<script lang="ts">
	import { formatRelativeDate } from '$lib/utils/dates';

	interface Props {
		orgId: string;
		unreadCount: number;
	}

	let { orgId, unreadCount }: Props = $props();

	interface Notification {
		id: string;
		type: string;
		title: string;
		message: string;
		link: string | null;
		read: boolean;
		created_at: string;
	}

	let open = $state(false);
	let notifications = $state<Notification[]>([]);
	let loading = $state(false);
	let localUnreadCount = $state(unreadCount);

	$effect(() => {
		localUnreadCount = unreadCount;
	});

	async function toggleOpen() {
		open = !open;
		if (open && notifications.length === 0) {
			await loadNotifications();
		}
	}

	async function loadNotifications() {
		loading = true;
		try {
			const res = await fetch(`/org/${orgId}/api/notifications`);
			if (res.ok) {
				notifications = await res.json();
			}
		} finally {
			loading = false;
		}
	}

	async function markAllRead() {
		await fetch(`/org/${orgId}/api/notifications`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ markAllRead: true })
		});
		notifications = notifications.map(n => ({ ...n, read: true }));
		localUnreadCount = 0;
	}

	async function dismissNotification(id: string) {
		await fetch(`/org/${orgId}/api/notifications`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		const wasUnread = notifications.find(n => n.id === id && !n.read);
		notifications = notifications.filter(n => n.id !== id);
		if (wasUnread) localUnreadCount = Math.max(0, localUnreadCount - 1);
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.notification-bell')) {
			open = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="notification-bell">
	<button class="bell-btn" onclick={toggleOpen} aria-label="Notifications">
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
			<path d="M13.73 21a2 2 0 0 1-3.46 0" />
		</svg>
		{#if localUnreadCount > 0}
			<span class="badge">{localUnreadCount > 9 ? '9+' : localUnreadCount}</span>
		{/if}
	</button>

	{#if open}
		<div class="dropdown">
			<div class="dropdown-header">
				<span class="dropdown-title">Notifications</span>
				{#if localUnreadCount > 0}
					<button class="mark-read-btn" onclick={markAllRead}>Mark all read</button>
				{/if}
			</div>
			<div class="dropdown-body">
				{#if loading}
					<div class="empty-state">Loading...</div>
				{:else if notifications.length === 0}
					<div class="empty-state">No notifications</div>
				{:else}
					{#each notifications as notif (notif.id)}
						<div class="notif-item" class:unread={!notif.read}>
							<div class="notif-content">
								{#if notif.link}
									<a href={notif.link} class="notif-title">{notif.title}</a>
								{:else}
									<span class="notif-title">{notif.title}</span>
								{/if}
								<span class="notif-message">{notif.message}</span>
								<span class="notif-time">{formatRelativeDate(notif.created_at)}</span>
							</div>
							<button class="dismiss-btn" onclick={() => dismissNotification(notif.id)} title="Dismiss">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								</svg>
							</button>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.notification-bell {
		position: relative;
	}
	.bell-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-muted);
		padding: var(--spacing-xs);
		position: relative;
		display: flex;
		align-items: center;
	}
	.bell-btn:hover {
		color: var(--color-text);
	}
	.badge {
		position: absolute;
		top: -2px;
		right: -4px;
		background: var(--color-error);
		color: white;
		font-size: 10px;
		font-weight: 700;
		min-width: 16px;
		height: 16px;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 4px;
	}
	.dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		width: 320px;
		max-height: 400px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		overflow: hidden;
	}
	.dropdown-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}
	.dropdown-title {
		font-weight: 600;
		font-size: var(--font-size-sm);
	}
	.mark-read-btn {
		background: none;
		border: none;
		color: var(--color-primary);
		font-size: var(--font-size-xs);
		cursor: pointer;
	}
	.dropdown-body {
		overflow-y: auto;
		max-height: 340px;
	}
	.empty-state {
		padding: var(--spacing-lg);
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.notif-item {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
	}
	.notif-item.unread {
		background: var(--color-surface-variant);
	}
	.notif-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.notif-title {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
	}
	a.notif-title {
		text-decoration: none;
	}
	a.notif-title:hover {
		text-decoration: underline;
	}
	.notif-message {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
	}
	.notif-time {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}
	.dismiss-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-muted);
		padding: 2px;
		flex-shrink: 0;
	}
	.dismiss-btn:hover {
		color: var(--color-error);
	}
</style>
```

**Step 3: Integrate NotificationBell into header**

In the component that renders the header (likely the org layout or AvatarMenu), add the NotificationBell next to the avatar:

```svelte
<NotificationBell {orgId} unreadCount={data.unreadNotificationCount} />
```

**Step 4: Commit**

```bash
git add src/lib/components/ui/NotificationBell.svelte src/routes/org/[orgId]/api/notifications/
git commit -m "feat: notification bell component with dropdown, notifications API endpoint"
```

---

### Task 16: Build Verification & Cleanup

**Step 1: Run type check**

```bash
npm run check 2>&1 | head -80
```

Fix any TypeScript errors from the new permission fields not being passed where expected.

**Step 2: Run build**

```bash
npm run build 2>&1 | tail -30
```

Expected: Build succeeds.

**Step 3: Manual testing checklist**

- [ ] Set a member as team leader → group dropdown appears
- [ ] Viewer preset → can navigate to pages, sees "Access Restricted" on locked ones
- [ ] Full editor → can access config managers and power features
- [ ] Non-full-editor member deletes a counseling record → sees "pending deletion" / approval request
- [ ] Admin approves deletion → record deleted, requester gets notification
- [ ] Bell icon shows unread count, dropdown shows notifications
- [ ] Admin hub has working tabs for Approvals and Audit Log
- [ ] Old /audit URL redirects to /admin/audit

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: build fixes and cleanup for permission enhancements"
```
