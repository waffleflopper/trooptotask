import { describe, it, expect } from 'vitest';
import { createIdentityAuthorization } from './authorization.server';
import type { PermissionContext } from '$lib/server/permissionContext';

function makePermissionContext(overrides?: Partial<PermissionContext>): PermissionContext {
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
		scopeSet: { kind: 'organization' },
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

		const auth = createIdentityAuthorization(permCtx, { userId }, orgId);

		expect(auth.userId).toBe('user-123');
		expect(auth.orgId).toBe('org-456');
		expect(auth.role).toBe('member');
		expect(auth.isPrivileged).toBe(false);
		expect(auth.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-A'] });
	});
});
