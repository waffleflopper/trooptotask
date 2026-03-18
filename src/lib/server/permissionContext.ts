import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';

export type FeatureArea = 'calendar' | 'personnel' | 'training' | 'onboarding' | 'leaders-book';

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

	assertCrudPermissions(opts: {
		area: FeatureArea;
		requireFullEditor?: boolean;
		personnelGroupId?: string | null;
	}): Promise<{ scopedGroupId: string | null; needsDeletionApproval: boolean }>;

	requireGroupAccess(supabase: SupabaseClient, personnelId: string): Promise<void>;
}

export async function createPermissionContext(
	supabase: SupabaseClient,
	userId: string,
	orgId: string
): Promise<PermissionContext> {
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select(
			'role, scoped_group_id, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members'
		)
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership) {
		throw error(403, 'Not a member of this organization');
	}

	const role = membership.role as 'owner' | 'admin' | 'member';
	const isOwner = role === 'owner';
	const isAdmin = role === 'admin';
	const isPrivileged = isOwner || isAdmin;
	const scopedGroupId = isPrivileged ? null : (membership.scoped_group_id as string | null);

	const canView: Record<FeatureArea, boolean> = {
		calendar: isPrivileged || !!membership.can_view_calendar,
		personnel: isPrivileged || !!membership.can_view_personnel,
		training: isPrivileged || !!membership.can_view_training,
		onboarding: isPrivileged || !!membership.can_view_onboarding,
		'leaders-book': isPrivileged || !!membership.can_view_leaders_book
	};

	const canEdit: Record<FeatureArea, boolean> = {
		calendar: isPrivileged || !!membership.can_edit_calendar,
		personnel: isPrivileged || !!membership.can_edit_personnel,
		training: isPrivileged || !!membership.can_edit_training,
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

	const areaLabel = (area: FeatureArea) => (area === 'leaders-book' ? 'leaders book' : area);

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

		async assertCrudPermissions(opts: {
			area: FeatureArea;
			requireFullEditor?: boolean;
			personnelGroupId?: string | null;
		}): Promise<{ scopedGroupId: string | null; needsDeletionApproval: boolean }> {
			if (opts.requireFullEditor) {
				ctx.requireFullEditor();
			} else {
				ctx.requireEdit(opts.area);
			}

			if (scopedGroupId && opts.personnelGroupId !== undefined && opts.personnelGroupId !== null) {
				if (opts.personnelGroupId !== scopedGroupId) {
					throw error(403, 'You do not have access to personnel outside your group');
				}
			}

			const needsDeletionApproval = !isPrivileged && !isFullEditor;

			return { scopedGroupId, needsDeletionApproval };
		},

		async requireGroupAccess(supabaseClient: SupabaseClient, personnelId: string): Promise<void> {
			if (!scopedGroupId) return;

			const { data: person } = await supabaseClient.from('personnel').select('group_id').eq('id', personnelId).single();

			if (person && person.group_id !== scopedGroupId) {
				throw error(403, 'You do not have access to personnel outside your group');
			}
		}
	};

	return ctx;
}
