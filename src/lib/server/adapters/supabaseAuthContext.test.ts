import { describe, it, expect } from 'vitest';
import { createSupabaseAuthContextAdapter } from './supabaseAuthContext';
import type { PermissionContext } from '$lib/server/permissionContext';

function makePermissionContext(overrides?: Partial<PermissionContext>): PermissionContext {
	const allTrue = {
		calendar: true,
		personnel: true,
		training: true,
		'critical-tasks': true,
		onboarding: true,
		'rating-scheme': true
	};

	return {
		role: 'admin',
		isOwner: false,
		isAdmin: true,
		isPrivileged: true,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		},
		compatibilityLanes: {},
		scopeSet: { kind: 'organization' },
		canView: { ...allTrue },
		canEdit: { ...allTrue },
		canManageMembers: true,
		...overrides
	};
}

describe('SupabaseAuthContextAdapter', () => {
	const userId = 'user-123';
	const orgId = 'org-456';

	it('exposes readonly properties from PermissionContext', () => {
		const permCtx = makePermissionContext({
			role: 'member',
			isPrivileged: false,
			scopeSet: { kind: 'groups', groupIds: ['group-A'] }
		});

		const auth = createSupabaseAuthContextAdapter(permCtx, userId, orgId);

		expect(auth.userId).toBe('user-123');
		expect(auth.orgId).toBe('org-456');
		expect(auth.role).toBe('member');
		expect(auth.isPrivileged).toBe(false);
		expect(auth.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-A'] });
	});
});
