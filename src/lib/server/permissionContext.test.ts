import { describe, it, expect } from 'vitest';
import { createPermissionContext } from './permissionContext';

// SvelteKit's error() throws an HttpError with status + body.message
function expectHttpError(e: unknown): { status: number; message: string } {
	const err = e as { status: number; body: { message: string } };
	return { status: err.status, message: err.body.message };
}

function mockSupabase(
	membershipRow: Record<string, unknown> | null,
	personnelRow?: Record<string, unknown> | null
) {
	return {
		from: (table: string) => ({
			select: () => ({
				eq: (_col: string, _val: string) => ({
					eq: (_col2: string, _val2: string) => ({
						single: () => {
							if (table === 'organization_memberships') {
								return Promise.resolve({ data: membershipRow, error: null });
							}
							return Promise.resolve({ data: personnelRow ?? null, error: null });
						}
					}),
					single: () => {
						// personnel table uses .eq('id', personnelId).single()
						return Promise.resolve({ data: personnelRow ?? null, error: null });
					}
				})
			})
		})
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mocking Supabase's complex generic type
	} as any;
}

const FULL_PERMISSIONS = {
	role: 'member' as const,
	scoped_group_id: null,
	can_view_calendar: true,
	can_edit_calendar: true,
	can_view_personnel: true,
	can_edit_personnel: true,
	can_view_training: true,
	can_edit_training: true,
	can_view_onboarding: true,
	can_edit_onboarding: true,
	can_view_leaders_book: true,
	can_edit_leaders_book: true,
	can_manage_members: true
};

function ownerRow() {
	return { ...FULL_PERMISSIONS, role: 'owner' };
}

function adminRow() {
	return { ...FULL_PERMISSIONS, role: 'admin' };
}

describe('createPermissionContext', () => {
	it('throws 403 when user is not a member of the organization', async () => {
		const supabase = mockSupabase(null);

		await expect(createPermissionContext(supabase, 'user-1', 'org-1')).rejects.toThrow();

		try {
			await createPermissionContext(supabase, 'user-1', 'org-1');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('Not a member of this organization');
		}
	});

	it('owner has full privileges', async () => {
		const ctx = await createPermissionContext(mockSupabase(ownerRow()), 'user-1', 'org-1');

		expect(ctx.role).toBe('owner');
		expect(ctx.isOwner).toBe(true);
		expect(ctx.isAdmin).toBe(false);
		expect(ctx.isPrivileged).toBe(true);
		expect(ctx.isFullEditor).toBe(false); // only applies to members
		expect(ctx.scopedGroupId).toBeNull();
		expect(ctx.canManageMembers).toBe(true);

		for (const area of ['calendar', 'personnel', 'training', 'onboarding', 'leaders-book'] as const) {
			expect(ctx.canView[area]).toBe(true);
			expect(ctx.canEdit[area]).toBe(true);
		}
	});

	it('admin has full privileges but is not owner', async () => {
		const ctx = await createPermissionContext(mockSupabase(adminRow()), 'user-1', 'org-1');

		expect(ctx.role).toBe('admin');
		expect(ctx.isOwner).toBe(false);
		expect(ctx.isAdmin).toBe(true);
		expect(ctx.isPrivileged).toBe(true);
		expect(ctx.isFullEditor).toBe(false);
		expect(ctx.scopedGroupId).toBeNull();
		expect(ctx.canManageMembers).toBe(true);

		for (const area of ['calendar', 'personnel', 'training', 'onboarding', 'leaders-book'] as const) {
			expect(ctx.canView[area]).toBe(true);
			expect(ctx.canEdit[area]).toBe(true);
		}
	});

	it('member has only their granted permissions', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({
				...FULL_PERMISSIONS,
				can_edit_calendar: false,
				can_view_personnel: false,
				can_edit_personnel: false,
				can_manage_members: false
			}),
			'user-1',
			'org-1'
		);

		expect(ctx.role).toBe('member');
		expect(ctx.isPrivileged).toBe(false);
		expect(ctx.canView.calendar).toBe(true);
		expect(ctx.canEdit.calendar).toBe(false);
		expect(ctx.canView.personnel).toBe(false);
		expect(ctx.canEdit.personnel).toBe(false);
		expect(ctx.canView.training).toBe(true);
		expect(ctx.canEdit.training).toBe(true);
		expect(ctx.canManageMembers).toBe(false);
	});

	it('member with all 11 permissions and no scope is a full editor', async () => {
		const ctx = await createPermissionContext(mockSupabase(FULL_PERMISSIONS), 'user-1', 'org-1');

		expect(ctx.isFullEditor).toBe(true);
		expect(ctx.isPrivileged).toBe(false);
	});

	it('member with all permissions but scoped to a group is NOT a full editor', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, scoped_group_id: 'group-1' }),
			'user-1',
			'org-1'
		);

		expect(ctx.isFullEditor).toBe(false);
		expect(ctx.scopedGroupId).toBe('group-1');
	});

	it('member missing one permission is NOT a full editor', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, can_edit_onboarding: false }),
			'user-1',
			'org-1'
		);

		expect(ctx.isFullEditor).toBe(false);
	});
});

describe('sync guards', () => {
	it('requireEdit passes for privileged roles regardless of flags', async () => {
		const ctx = await createPermissionContext(mockSupabase(ownerRow()), 'user-1', 'org-1');
		expect(() => ctx.requireEdit('personnel')).not.toThrow();
	});

	it('requireEdit passes for member with the specific permission', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, can_edit_calendar: true }),
			'user-1',
			'org-1'
		);
		expect(() => ctx.requireEdit('calendar')).not.toThrow();
	});

	it('requireEdit throws 403 when member lacks permission', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, can_edit_personnel: false }),
			'user-1',
			'org-1'
		);
		try {
			ctx.requireEdit('personnel');
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('You do not have permission to edit personnel data');
		}
	});

	it('requireView throws 403 when member lacks view permission', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, can_view_training: false }),
			'user-1',
			'org-1'
		);
		try {
			ctx.requireView('training');
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('You do not have permission to view training data');
		}
	});

	it('requirePrivileged passes for admin', async () => {
		const ctx = await createPermissionContext(mockSupabase(adminRow()), 'user-1', 'org-1');
		expect(() => ctx.requirePrivileged()).not.toThrow();
	});

	it('requirePrivileged throws 403 for member', async () => {
		const ctx = await createPermissionContext(mockSupabase(FULL_PERMISSIONS), 'user-1', 'org-1');
		try {
			ctx.requirePrivileged();
			expect.unreachable('should have thrown');
		} catch (e) {
			expect(expectHttpError(e).status).toBe(403);
		}
	});

	it('requireOwner passes for owner, throws for admin', async () => {
		const ownerCtx = await createPermissionContext(mockSupabase(ownerRow()), 'user-1', 'org-1');
		expect(() => ownerCtx.requireOwner()).not.toThrow();

		const adminCtx = await createPermissionContext(mockSupabase(adminRow()), 'user-1', 'org-1');
		try {
			adminCtx.requireOwner();
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('Only the organization owner can perform this action');
		}
	});

	it('requireFullEditor passes for full editor member, throws for partial member', async () => {
		const fullCtx = await createPermissionContext(mockSupabase(FULL_PERMISSIONS), 'user-1', 'org-1');
		expect(() => fullCtx.requireFullEditor()).not.toThrow();

		const partialCtx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, can_edit_training: false }),
			'user-1',
			'org-1'
		);
		try {
			partialCtx.requireFullEditor();
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('This action requires full editor, admin, or owner permissions');
		}
	});

	it('requireManageMembers passes for privileged or member with flag', async () => {
		const adminCtx = await createPermissionContext(mockSupabase(adminRow()), 'user-1', 'org-1');
		expect(() => adminCtx.requireManageMembers()).not.toThrow();

		const memberCtx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, can_manage_members: true }),
			'user-1',
			'org-1'
		);
		expect(() => memberCtx.requireManageMembers()).not.toThrow();
	});

	it('requireManageMembers throws for member without flag', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, can_manage_members: false }),
			'user-1',
			'org-1'
		);
		try {
			ctx.requireManageMembers();
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('You do not have permission to manage this organization');
		}
	});
});

describe('assertCrudPermissions', () => {
	it('privileged role returns no scope and no deletion approval needed', async () => {
		const ctx = await createPermissionContext(mockSupabase(ownerRow()), 'user-1', 'org-1');
		const result = await ctx.assertCrudPermissions({ area: 'personnel' });

		expect(result.scopedGroupId).toBeNull();
		expect(result.needsDeletionApproval).toBe(false);
	});

	it('full editor member returns no scope and no deletion approval', async () => {
		const ctx = await createPermissionContext(mockSupabase(FULL_PERMISSIONS), 'user-1', 'org-1');
		const result = await ctx.assertCrudPermissions({ area: 'personnel' });

		expect(result.scopedGroupId).toBeNull();
		expect(result.needsDeletionApproval).toBe(false);
	});

	it('scoped member with permission gets their scopedGroupId and needs deletion approval', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, scoped_group_id: 'group-1' }),
			'user-1',
			'org-1'
		);
		const result = await ctx.assertCrudPermissions({ area: 'training' });

		expect(result.scopedGroupId).toBe('group-1');
		expect(result.needsDeletionApproval).toBe(true);
	});

	it('throws 403 when member lacks edit permission for the area', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, can_edit_personnel: false }),
			'user-1',
			'org-1'
		);

		await expect(ctx.assertCrudPermissions({ area: 'personnel' })).rejects.toThrow();
	});

	it('requireFullEditor option throws for non-full-editor member', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, can_edit_onboarding: false }),
			'user-1',
			'org-1'
		);

		try {
			await ctx.assertCrudPermissions({ area: 'training', requireFullEditor: true });
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('This action requires full editor, admin, or owner permissions');
		}
	});

	it('requireFullEditor option passes for privileged role', async () => {
		const ctx = await createPermissionContext(mockSupabase(adminRow()), 'user-1', 'org-1');
		const result = await ctx.assertCrudPermissions({ area: 'training', requireFullEditor: true });

		expect(result.needsDeletionApproval).toBe(false);
	});

	it('throws 403 when scoped member accesses personnel outside their group', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, scoped_group_id: 'group-1' }),
			'user-1',
			'org-1'
		);

		try {
			await ctx.assertCrudPermissions({ area: 'personnel', personnelGroupId: 'group-2' });
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('You do not have access to personnel outside your group');
		}
	});

	it('scoped member can access personnel in their own group', async () => {
		const ctx = await createPermissionContext(
			mockSupabase({ ...FULL_PERMISSIONS, scoped_group_id: 'group-1' }),
			'user-1',
			'org-1'
		);
		const result = await ctx.assertCrudPermissions({
			area: 'personnel',
			personnelGroupId: 'group-1'
		});

		expect(result.scopedGroupId).toBe('group-1');
	});
});

describe('requireGroupAccess', () => {
	it('privileged role skips group check entirely', async () => {
		const supabase = mockSupabase(ownerRow());
		const ctx = await createPermissionContext(supabase, 'user-1', 'org-1');

		// Should not throw even without personnel data
		await expect(ctx.requireGroupAccess(supabase, 'person-1')).resolves.toBeUndefined();
	});

	it('unscoped member skips group check', async () => {
		const supabase = mockSupabase(FULL_PERMISSIONS);
		const ctx = await createPermissionContext(supabase, 'user-1', 'org-1');

		await expect(ctx.requireGroupAccess(supabase, 'person-1')).resolves.toBeUndefined();
	});

	it('scoped member can access personnel in their group', async () => {
		const supabase = mockSupabase(
			{ ...FULL_PERMISSIONS, scoped_group_id: 'group-1' },
			{ group_id: 'group-1' }
		);
		const ctx = await createPermissionContext(supabase, 'user-1', 'org-1');

		await expect(ctx.requireGroupAccess(supabase, 'person-1')).resolves.toBeUndefined();
	});

	it('scoped member cannot access personnel outside their group', async () => {
		const supabase = mockSupabase(
			{ ...FULL_PERMISSIONS, scoped_group_id: 'group-1' },
			{ group_id: 'group-2' }
		);
		const ctx = await createPermissionContext(supabase, 'user-1', 'org-1');

		try {
			await ctx.requireGroupAccess(supabase, 'person-1');
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('You do not have access to personnel outside your group');
		}
	});
});
