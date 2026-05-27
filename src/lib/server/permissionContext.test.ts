import { describe, it, expect, vi } from 'vitest';
import { createPermissionContextFromMembership, getMembershipRow } from './permissionContext';

describe('createPermissionContextFromMembership', () => {
	const baseMembership = {
		role: 'member' as const,
		member_preset: 'viewer' as const,
		capability_overrides: {},
		access_scope_kind: 'organization' as const,
		access_scope_group_ids: []
	};

	it('builds correct role and privilege flags for a member', () => {
		const ctx = createPermissionContextFromMembership(baseMembership);

		expect(ctx.role).toBe('member');
		expect(ctx.isOwner).toBe(false);
		expect(ctx.isAdmin).toBe(false);
		expect(ctx.isPrivileged).toBe(false);
	});

	it('builds correct role and privilege flags for an owner', () => {
		const ctx = createPermissionContextFromMembership({ ...baseMembership, role: 'owner' });

		expect(ctx.role).toBe('owner');
		expect(ctx.isOwner).toBe(true);
		expect(ctx.isPrivileged).toBe(true);
	});

	it('builds correct role and privilege flags for an admin', () => {
		const ctx = createPermissionContextFromMembership({ ...baseMembership, role: 'admin' });

		expect(ctx.role).toBe('admin');
		expect(ctx.isAdmin).toBe(true);
		expect(ctx.isPrivileged).toBe(true);
	});

	it.each(['owner', 'admin'] as const)('builds privileged access from replacement-only %s membership', (role) => {
		const ctx = createPermissionContextFromMembership({ role });

		expect(ctx.role).toBe(role);
		expect(ctx.isPrivileged).toBe(true);
		expect(ctx.capabilityMap.calendar).toBe('configure');
		expect(ctx.capabilityMap.personnel).toBe('configure');
		expect(ctx.scopeSet).toEqual({ kind: 'organization' });
		expect(ctx.canManageMembers).toBe(true);
	});

	it('maps replacement storage correctly for a member', () => {
		const ctx = createPermissionContextFromMembership(baseMembership);

		expect(ctx.canView.calendar).toBe(true);
		expect(ctx.canEdit.calendar).toBe(false);
		expect(ctx.canView.personnel).toBe(true);
		expect(ctx.canEdit.personnel).toBe(false);
		expect(ctx.canView.training).toBe(true);
		expect(ctx.canEdit.training).toBe(false);
		expect(ctx.canView['critical-tasks']).toBe(true);
		expect(ctx.canEdit['critical-tasks']).toBe(false);
		expect(ctx.canView['rating-scheme']).toBe(true);
		expect(ctx.canEdit['rating-scheme']).toBe(false);
		expect(ctx.canManageMembers).toBe(false);
	});

	it('uses replacement capability overrides for rating scheme access', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			capability_overrides: { ratingScheme: 'none' }
		});

		expect(ctx.canView['rating-scheme']).toBe(false);
		expect(ctx.canEdit['rating-scheme']).toBe(false);
	});

	it('grants all permissions for privileged roles regardless of flags', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			role: 'admin',
			member_preset: 'viewer',
			capability_overrides: { training: 'none' }
		});

		expect(ctx.canView.training).toBe(true);
		expect(ctx.canEdit.training).toBe(true);
	});

	it('respects replacement Scope Set for members', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-123']
		});

		expect(ctx.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-123'] });
	});

	it('uses stored capability and multi-Group scope when available', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			member_preset: 'viewer',
			capability_overrides: { personnel: 'operate' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-a', 'group-b']
		});

		expect(ctx.capabilityMap.personnel).toBe('operate');
		expect(ctx.compatibilityLanes).toEqual({});
		expect(ctx.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
	});

	it('builds Policy Decision inputs from replacement-only membership access', () => {
		const ctx = createPermissionContextFromMembership({
			role: 'member',
			member_preset: 'operator',
			capability_overrides: { calendar: 'view', training: 'configure' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-a', 'group-b']
		});

		expect(ctx.role).toBe('member');
		expect(ctx.capabilityMap.calendar).toBe('view');
		expect(ctx.capabilityMap.personnel).toBe('operate');
		expect(ctx.capabilityMap.training).toBe('configure');
		expect(ctx.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
		expect(ctx.canEdit.training).toBe(true);
		expect(ctx.canEdit.personnel).toBe(false);
		expect(ctx.canManageMembers).toBe(false);
	});

	it.each([null, 'custom'] as const)(
		'requires valid normalized replacement preset %s when fetching membership rows',
		async (memberPreset) => {
			const query = {
				eq: vi.fn(),
				single: vi.fn().mockResolvedValue({
					data: {
						id: 'membership-1',
						role: 'member',
						member_preset: memberPreset,
						capability_overrides: {},
						access_scope_kind: 'organization',
						access_scope_group_ids: []
					}
				})
			};
			query.eq.mockReturnValue(query);
			const supabase = {
				from: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue(query)
				})
			};

			await expect(getMembershipRow(supabase as never, 'user-1', 'org-1')).rejects.toMatchObject({
				status: 500,
				body: { message: 'Membership row is missing normalized member access storage' }
			});
		}
	);

	it('keeps retired compatibility lanes out of the permission context', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			member_preset: 'viewer',
			capability_overrides: { personnel: 'operate' },
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		});

		expect(ctx.compatibilityLanes).toEqual({});
	});

	it('uses replacement member access without legacy fallback inputs', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			member_preset: 'viewer',
			capability_overrides: { calendar: 'operate' },
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		});

		expect(ctx.capabilityMap.calendar).toBe('operate');
		expect(ctx.scopeSet).toEqual({ kind: 'organization' });
	});

	it('ignores stored group scope for privileged roles', () => {
		const ctx = createPermissionContextFromMembership({
			...baseMembership,
			role: 'owner',
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-123']
		});

		expect(ctx.scopeSet).toEqual({ kind: 'organization' });
	});

	it('maps all-permission members to organization-wide configure capabilities', () => {
		const ctx = createPermissionContextFromMembership({
			role: 'member',
			member_preset: 'editor',
			capability_overrides: {},
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		});

		expect(ctx.capabilityMap).toMatchObject({
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure'
		});
	});

	it('does not map disabled critical tasks permissions to configure capability', () => {
		const ctx = createPermissionContextFromMembership({
			role: 'member',
			member_preset: 'editor',
			capability_overrides: { criticalTasks: 'none' },
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		});

		expect(ctx.capabilityMap.criticalTasks).not.toBe('configure');
	});
});
