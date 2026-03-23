import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAuthContextAdapter, createSandboxAuthContext } from './supabaseAuthContext';
import type { PermissionContext } from '$lib/server/permissionContext';
import type { SupabaseClient } from '@supabase/supabase-js';

function makePermissionContext(overrides?: Partial<PermissionContext>): PermissionContext {
	const allTrue = {
		calendar: true,
		personnel: true,
		training: true,
		onboarding: true,
		'leaders-book': true
	};

	return {
		role: 'admin',
		isOwner: false,
		isAdmin: true,
		isPrivileged: true,
		isFullEditor: false,
		scopedGroupId: null,
		canView: { ...allTrue },
		canEdit: { ...allTrue },
		canManageMembers: true,
		requireEdit: vi.fn(),
		requireView: vi.fn(),
		requirePrivileged: vi.fn(),
		requireOwner: vi.fn(),
		requireFullEditor: vi.fn(),
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
			isFullEditor: true,
			scopedGroupId: 'group-A'
		});

		const auth = createSupabaseAuthContextAdapter(permCtx, fakeSupabase, userId, orgId);

		expect(auth.userId).toBe('user-123');
		expect(auth.orgId).toBe('org-456');
		expect(auth.role).toBe('member');
		expect(auth.isPrivileged).toBe(false);
		expect(auth.isFullEditor).toBe(true);
		expect(auth.scopedGroupId).toBe('group-A');
	});

	it('delegates requireEdit to PermissionContext', () => {
		const permCtx = makePermissionContext();
		const auth = createSupabaseAuthContextAdapter(permCtx, fakeSupabase, userId, orgId);

		auth.requireEdit('personnel');
		expect(permCtx.requireEdit).toHaveBeenCalledWith('personnel');
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

	it('delegates requireFullEditor to PermissionContext', () => {
		const permCtx = makePermissionContext();
		const auth = createSupabaseAuthContextAdapter(permCtx, fakeSupabase, userId, orgId);

		auth.requireFullEditor();
		expect(permCtx.requireFullEditor).toHaveBeenCalled();
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

describe('createSandboxAuthContext', () => {
	it('returns a permissive context with owner role', () => {
		const auth = createSandboxAuthContext('org-sandbox');

		expect(auth.userId).toBeNull();
		expect(auth.orgId).toBe('org-sandbox');
		expect(auth.role).toBe('owner');
		expect(auth.isPrivileged).toBe(true);
		expect(auth.scopedGroupId).toBeNull();
	});

	it('does not throw on any require* call', async () => {
		const auth = createSandboxAuthContext('org-sandbox');

		expect(() => auth.requireEdit('personnel')).not.toThrow();
		expect(() => auth.requireView('training')).not.toThrow();
		expect(() => auth.requirePrivileged()).not.toThrow();
		expect(() => auth.requireOwner()).not.toThrow();
		expect(() => auth.requireFullEditor()).not.toThrow();
		await expect(auth.requireGroupAccess('p-1')).resolves.toBeUndefined();
		await expect(auth.requireGroupAccessBatch(['p-1'])).resolves.toBeUndefined();
		await expect(auth.requireGroupAccessByRecord('t', 'r', 'c')).resolves.toBeUndefined();
	});
});
