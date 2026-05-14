import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAuthContextAdapter } from './supabaseAuthContext';
import { createCompatibilityLaneMap } from '$lib/access/memberAccessShape';
import type { PermissionContext } from '$lib/server/permissionContext';
import type { SupabaseClient } from '@supabase/supabase-js';

function makePermissionContext(overrides?: Partial<PermissionContext>): PermissionContext {
	const allTrue = {
		calendar: true,
		personnel: true,
		training: true,
		'critical-tasks': true,
		onboarding: true,
		'rating-scheme': true,
		'leaders-book': true
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
		compatibilityLanes: createCompatibilityLaneMap('configure'),
		scopeSet: { kind: 'organization' },
		canView: { ...allTrue },
		canEdit: { ...allTrue },
		canManageMembers: true,
		requireView: vi.fn(),
		requirePrivileged: vi.fn(),
		requireOwner: vi.fn(),
		requireManageMembers: vi.fn(),
		requireGroupAccess: vi.fn().mockResolvedValue(undefined),
		requireGroupAccessBatch: vi.fn().mockResolvedValue(undefined),
		requireGroupAccessByRecord: vi.fn().mockResolvedValue(undefined),
		...overrides
	};
}

describe('SupabaseAuthContextAdapter', () => {
	const fakeSupabase = { fake: true } as unknown as SupabaseClient;
	const userId = 'user-123';
	const orgId = 'org-456';

	it('exposes readonly properties from PermissionContext', () => {
		const permCtx = makePermissionContext({
			role: 'member',
			isPrivileged: false,
			scopeSet: { kind: 'groups', groupIds: ['group-A'] }
		});

		const auth = createSupabaseAuthContextAdapter(permCtx, fakeSupabase, userId, orgId);

		expect(auth.userId).toBe('user-123');
		expect(auth.orgId).toBe('org-456');
		expect(auth.role).toBe('member');
		expect(auth.isPrivileged).toBe(false);
		expect(auth.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-A'] });
	});

	it('delegates requireView to PermissionContext', () => {
		const permCtx = makePermissionContext();
		const auth = createSupabaseAuthContextAdapter(permCtx, fakeSupabase, userId, orgId);

		auth.requireView('training');
		expect(permCtx.requireView).toHaveBeenCalledWith('training');
	});

	it('delegates requirePrivileged to PermissionContext', () => {
		const permCtx = makePermissionContext();
		const auth = createSupabaseAuthContextAdapter(permCtx, fakeSupabase, userId, orgId);

		auth.requirePrivileged();
		expect(permCtx.requirePrivileged).toHaveBeenCalled();
	});

	it('delegates requireOwner to PermissionContext', () => {
		const permCtx = makePermissionContext();
		const auth = createSupabaseAuthContextAdapter(permCtx, fakeSupabase, userId, orgId);

		auth.requireOwner();
		expect(permCtx.requireOwner).toHaveBeenCalled();
	});

	it('delegates requireGroupAccess with captured supabase client', async () => {
		const permCtx = makePermissionContext();
		const auth = createSupabaseAuthContextAdapter(permCtx, fakeSupabase, userId, orgId);

		await auth.requireGroupAccess('p-1');
		expect(permCtx.requireGroupAccess).toHaveBeenCalledWith(fakeSupabase, 'p-1');
	});

	it('delegates requireGroupAccessBatch with captured supabase client', async () => {
		const permCtx = makePermissionContext();
		const auth = createSupabaseAuthContextAdapter(permCtx, fakeSupabase, userId, orgId);

		await auth.requireGroupAccessBatch(['p-1', 'p-2']);
		expect(permCtx.requireGroupAccessBatch).toHaveBeenCalledWith(fakeSupabase, ['p-1', 'p-2']);
	});

	it('delegates requireGroupAccessByRecord with captured supabase client and orgId', async () => {
		const permCtx = makePermissionContext();
		const auth = createSupabaseAuthContextAdapter(permCtx, fakeSupabase, userId, orgId);

		await auth.requireGroupAccessByRecord('training_records', 'tr-1', 'personnel_id');
		expect(permCtx.requireGroupAccessByRecord).toHaveBeenCalledWith(
			fakeSupabase,
			'training_records',
			'tr-1',
			'org-456',
			'personnel_id'
		);
	});
});
