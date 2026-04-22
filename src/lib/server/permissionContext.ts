/**
 * PermissionContext — runtime permission state for a single authenticated user in an org.
 *
 * Three construction paths:
 * - `createPermissionContext(supabase, userId, orgId)` — fetches the membership row and builds.
 *   Use in routes that don't already have the row (rare; prefer the layout-based path).
 * - `createPermissionContextFromMembership(row)` — builds from an already-fetched membership row.
 *   This is the standard path; the layout server fetches the row once, all routes reuse it.
 * - `createSandboxContext()` — all-permissions-true no-op context used in demo/sandbox orgs.
 *
 * PermissionContext is consumed by the AuthContext adapter (`supabaseAuthContext.ts`), which
 * wraps it in the AuthContext port used by use cases. Direct use in routes is discouraged;
 * go through `ctx.auth` (UseCaseContext) instead.
 */
import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeatureArea } from './core/ports';
import { createSupabaseGroupResolver, enforceGroupAccess, enforceGroupAccessBatch } from './groupAccess';

export type { FeatureArea };

export interface PermissionContext {
	readonly role: 'owner' | 'admin' | 'member';
	readonly isOwner: boolean;
	readonly isAdmin: boolean;
	readonly isPrivileged: boolean;
	readonly isFullEditor: boolean;
	readonly scopedGroupId: string | null;
	readonly canView: Record<FeatureArea, boolean>;
	readonly canEdit: Record<FeatureArea, boolean>;
	readonly canManageMembers: boolean;

	requireEdit(area: FeatureArea): void;
	requireView(area: FeatureArea): void;
	requirePrivileged(): void;
	requireOwner(): void;
	requireFullEditor(): void;
	requireManageMembers(): void;

	requireGroupAccess(supabase: SupabaseClient, personnelId: string): Promise<void>;
	requireGroupAccessBatch(supabase: SupabaseClient, personnelIds: string[]): Promise<void>;
	requireGroupAccessByRecord(
		supabase: SupabaseClient,
		table: string,
		recordId: string,
		orgId: string,
		personnelIdColumn: string
	): Promise<void>;
}

export function createSandboxContext(): PermissionContext {
	const allTrue: Record<FeatureArea, boolean> = {
		calendar: true,
		personnel: true,
		training: true,
		'critical-tasks': true,
		onboarding: true,
		'leaders-book': true
	};

	const ctx: PermissionContext = {
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		isFullEditor: false,
		scopedGroupId: null,
		canView: { ...allTrue },
		canEdit: { ...allTrue },
		canManageMembers: true,

		requireEdit(): void {},
		requireView(): void {},
		requirePrivileged(): void {},
		requireOwner(): void {},
		requireFullEditor(): void {},
		requireManageMembers(): void {},

		async requireGroupAccess(): Promise<void> {},
		async requireGroupAccessBatch(): Promise<void> {},
		async requireGroupAccessByRecord(): Promise<void> {}
	};

	return ctx;
}

/** The shape of a membership row needed to build a PermissionContext (no DB query required) */
export interface MembershipRow {
	role: 'owner' | 'admin' | 'member';
	scoped_group_id: string | null;
	can_view_calendar: boolean;
	can_edit_calendar: boolean;
	can_view_personnel: boolean;
	can_edit_personnel: boolean;
	can_view_training: boolean;
	can_edit_training: boolean;
	can_view_critical_tasks?: boolean;
	can_edit_critical_tasks?: boolean;
	can_view_onboarding: boolean;
	can_edit_onboarding: boolean;
	can_view_leaders_book: boolean;
	can_edit_leaders_book: boolean;
	can_manage_members: boolean;
}

/**
 * Build a PermissionContext from an already-fetched membership row.
 * This avoids a redundant DB query when the caller already has the membership data.
 * Group access enforcement requires a SupabaseClient, so those methods are no-ops here —
 * they are wired up in the AuthContext adapter layer which has the client.
 */
export function createPermissionContextFromMembership(membership: MembershipRow): PermissionContext {
	const role = membership.role;
	const isOwner = role === 'owner';
	const isAdmin = role === 'admin';
	const isPrivileged = isOwner || isAdmin;
	const scopedGroupId = isPrivileged ? null : (membership.scoped_group_id as string | null);

	const canView: Record<FeatureArea, boolean> = {
		calendar: isPrivileged || !!membership.can_view_calendar,
		personnel: isPrivileged || !!membership.can_view_personnel,
		training: isPrivileged || !!membership.can_view_training,
		'critical-tasks': isPrivileged || !!membership.can_view_critical_tasks,
		onboarding: isPrivileged || !!membership.can_view_onboarding,
		'leaders-book': isPrivileged || !!membership.can_view_leaders_book
	};

	const canEdit: Record<FeatureArea, boolean> = {
		calendar: isPrivileged || !!membership.can_edit_calendar,
		personnel: isPrivileged || !!membership.can_edit_personnel,
		training: isPrivileged || !!membership.can_edit_training,
		'critical-tasks': isPrivileged || !!membership.can_edit_critical_tasks,
		onboarding: isPrivileged || !!membership.can_edit_onboarding,
		'leaders-book': isPrivileged || !!membership.can_edit_leaders_book
	};

	const canManageMembers = isPrivileged || !!membership.can_manage_members;

	const isFullEditor =
		!isPrivileged &&
		!scopedGroupId &&
		canView.calendar &&
		canEdit.calendar &&
		canView.personnel &&
		canEdit.personnel &&
		canView.training &&
		canEdit.training &&
		canView.onboarding &&
		canEdit.onboarding &&
		canView['leaders-book'] &&
		canEdit['leaders-book'];

	const areaLabel = (area: FeatureArea) => {
		switch (area) {
			case 'leaders-book':
				return 'leaders book';
			case 'critical-tasks':
				return 'critical tasks';
			default:
				return area;
		}
	};

	const ctx: PermissionContext = {
		role,
		isOwner,
		isAdmin,
		isPrivileged,
		isFullEditor,
		scopedGroupId,
		canView,
		canEdit,
		canManageMembers,

		requireEdit(area: FeatureArea): void {
			if (!canEdit[area]) {
				throw error(403, `You do not have permission to edit ${areaLabel(area)} data`);
			}
		},

		requireView(area: FeatureArea): void {
			if (!canView[area]) {
				throw error(403, `You do not have permission to view ${areaLabel(area)} data`);
			}
		},

		requirePrivileged(): void {
			if (!isPrivileged) {
				throw error(403, 'This action requires admin or owner permissions');
			}
		},

		requireOwner(): void {
			if (!isOwner) {
				throw error(403, 'Only the organization owner can perform this action');
			}
		},

		requireFullEditor(): void {
			if (!isPrivileged && !isFullEditor) {
				throw error(403, 'This action requires full editor, admin, or owner permissions');
			}
		},

		requireManageMembers(): void {
			if (!canManageMembers) {
				throw error(403, 'You do not have permission to manage this organization');
			}
		},

		async requireGroupAccess(supabaseClient: SupabaseClient, personnelId: string): Promise<void> {
			const resolver = createSupabaseGroupResolver(supabaseClient);
			await enforceGroupAccess(resolver, scopedGroupId, personnelId);
		},

		async requireGroupAccessBatch(supabaseClient: SupabaseClient, personnelIds: string[]): Promise<void> {
			const resolver = createSupabaseGroupResolver(supabaseClient);
			await enforceGroupAccessBatch(resolver, scopedGroupId, personnelIds);
		},

		async requireGroupAccessByRecord(
			supabaseClient: SupabaseClient,
			table: string,
			recordId: string,
			orgId: string,
			personnelIdColumn: string
		): Promise<void> {
			if (!scopedGroupId) return;

			const { data: record } = await supabaseClient
				.from(table)
				.select(personnelIdColumn)
				.eq('id', recordId)
				.eq('organization_id', orgId)
				.single();

			if (!record) return;

			const personnelId = (record as unknown as Record<string, unknown>)[personnelIdColumn] as string | null;
			if (!personnelId) return;

			const resolver = createSupabaseGroupResolver(supabaseClient);
			await enforceGroupAccess(resolver, scopedGroupId, personnelId);
		}
	};

	return ctx;
}

export async function createPermissionContext(
	supabase: SupabaseClient,
	userId: string,
	orgId: string
): Promise<PermissionContext> {
	const membership = await getMembershipRow(supabase, userId, orgId);
	return createPermissionContextFromMembership(membership);
}

export async function getMembershipRow(
	supabase: SupabaseClient,
	userId: string,
	orgId: string
): Promise<MembershipRow> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select(
			'role, scoped_group_id, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_critical_tasks, can_edit_critical_tasks, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members'
		)
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership) {
		throw error(403, 'Not a member of this organization');
	}

	return membership as MembershipRow;
}
