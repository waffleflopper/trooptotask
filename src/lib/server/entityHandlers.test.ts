import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock dependencies (same pattern as apiRoute.test.ts)
vi.mock('$lib/server/supabase', () => ({
	getApiContext: vi.fn()
}));
vi.mock('$lib/server/permissionContext', async () => {
	const actual = await vi.importActual('$lib/server/permissionContext');
	return {
		...actual,
		createPermissionContext: vi.fn()
	};
});
vi.mock('$lib/server/read-only-guard', () => ({
	checkReadOnly: vi.fn()
}));
vi.mock('$lib/server/validation', () => ({
	validateUUID: vi.fn()
}));
vi.mock('$lib/server/auditLog', () => ({
	auditLog: vi.fn(),
	getRequestInfo: vi.fn()
}));

import { field, defineEntity } from './entitySchema';
import { getApiContext } from '$lib/server/supabase';
import { createPermissionContext } from '$lib/server/permissionContext';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { validateUUID } from '$lib/server/validation';
import type { PermissionContext } from '$lib/server/permissionContext';

const VALID_ORG_ID = '00000000-0000-0000-0000-000000000001';

function mockPermissionContext(overrides: Partial<PermissionContext> = {}): PermissionContext {
	return {
		role: 'member',
		isOwner: false,
		isAdmin: false,
		isPrivileged: false,
		isFullEditor: false,
		scopedGroupId: null,
		canView: { calendar: true, personnel: true, training: true, onboarding: true, 'leaders-book': true },
		canEdit: { calendar: true, personnel: true, training: true, onboarding: true, 'leaders-book': true },
		canManageMembers: false,
		requireEdit: vi.fn(),
		requireView: vi.fn(),
		requirePrivileged: vi.fn(),
		requireOwner: vi.fn(),
		requireFullEditor: vi.fn(),
		requireManageMembers: vi.fn(),
		requireGroupAccess: vi.fn(),
		requireGroupAccessBatch: vi.fn(),
		requireGroupAccessByRecord: vi.fn(),
		...overrides
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mocking Supabase's complex generic type
function createMockSupabase(returnData: unknown = null, returnError: unknown = null): any {
	const chain = {
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: returnData, error: returnError })
	};
	return {
		from: vi.fn().mockReturnValue(chain),
		_chain: chain
	};
}

function mockRequestEvent(
	method: string,
	body?: Record<string, unknown>
): Parameters<ReturnType<typeof import('./entitySchema').defineEntity>['handlers']['POST']>[0] {
	const init: RequestInit = { method };
	if (body) {
		init.body = JSON.stringify(body);
		init.headers = { 'content-type': 'application/json' };
	}
	return {
		params: { orgId: VALID_ORG_ID },
		locals: { user: { email: 'test@example.com' } } as unknown as App.Locals,
		cookies: {} as never,
		request: new Request('http://localhost/test', init)
	} as unknown as Parameters<ReturnType<typeof import('./entitySchema').defineEntity>['handlers']['POST']>[0];
}

// Test entity definition
function createTestEntity(overrides = {}) {
	return defineEntity({
		table: 'test_records',
		groupScope: 'none',
		permission: 'training',
		schema: {
			id: field(z.string(), { readOnly: true }),
			name: field(z.string()),
			personnelId: field(z.string(), { column: 'personnel_id' }),
			score: field(z.number().nullable(), { nullDefault: 0 }),
			notes: field(z.string(), { insertDefault: '' })
		},
		...overrides
	});
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(validateUUID).mockReturnValue(true);
	vi.mocked(checkReadOnly).mockResolvedValue(null);
});

describe('entity handlers POST', () => {
	it('inserts and returns transformed data', async () => {
		const mockSupabase = createMockSupabase({
			id: 'new-id',
			name: 'Test Record',
			personnel_id: 'p-1',
			score: 95,
			notes: 'good'
		});
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const entity = createTestEntity();
		const event = mockRequestEvent('POST', {
			name: 'Test Record',
			personnelId: 'p-1',
			score: 95
		});

		const response = await entity.handlers.POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({
			id: 'new-id',
			name: 'Test Record',
			personnelId: 'p-1',
			score: 95,
			notes: 'good'
		});

		// Verify Supabase was called correctly
		expect(mockSupabase.from).toHaveBeenCalledWith('test_records');
		expect(mockSupabase._chain.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				organization_id: VALID_ORG_ID,
				name: 'Test Record',
				personnel_id: 'p-1',
				score: 95,
				notes: '' // insertDefault
			})
		);
	});
});

describe('entity handlers PUT', () => {
	it('updates and returns transformed data', async () => {
		const mockSupabase = createMockSupabase({
			id: 'existing-id',
			name: 'Updated Name',
			personnel_id: 'p-1',
			score: 100,
			notes: 'updated'
		});
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const entity = createTestEntity();
		const event = mockRequestEvent('PUT', {
			id: 'existing-id',
			name: 'Updated Name'
		});

		const response = await entity.handlers.PUT(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({
			id: 'existing-id',
			name: 'Updated Name',
			personnelId: 'p-1',
			score: 100,
			notes: 'updated'
		});

		expect(mockSupabase.from).toHaveBeenCalledWith('test_records');
		expect(mockSupabase._chain.update).toHaveBeenCalledWith({ name: 'Updated Name' });
		expect(mockSupabase._chain.eq).toHaveBeenCalledWith('id', 'existing-id');
		expect(mockSupabase._chain.eq).toHaveBeenCalledWith('organization_id', VALID_ORG_ID);
	});

	it('rejects missing id', async () => {
		const mockSupabase = createMockSupabase();
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const entity = createTestEntity();
		const event = mockRequestEvent('PUT', { name: 'No ID' });

		const response = await entity.handlers.PUT(event);
		expect(response.status).toBe(400);
	});
});

describe('entity handlers DELETE', () => {
	it('deletes and returns success', async () => {
		const mockSupabase = createMockSupabase();
		// Make delete chain resolve without error
		mockSupabase._chain.single = undefined;
		mockSupabase._chain.eq.mockReturnValue({
			eq: vi.fn().mockResolvedValue({ error: null })
		});
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const entity = createTestEntity();
		const event = mockRequestEvent('DELETE', { id: 'del-id' });

		const response = await entity.handlers.DELETE(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({ success: true });
		expect(mockSupabase.from).toHaveBeenCalledWith('test_records');
	});
});

describe('entity handlers group scope', () => {
	it('groupScope none — no requireGroupAccessByRecord on PUT', async () => {
		const mockSupabase = createMockSupabase({
			id: 'existing-id',
			name: 'Updated',
			personnel_id: 'p-1',
			score: 50,
			notes: ''
		});
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const entity = createTestEntity({ groupScope: 'none' });
		const event = mockRequestEvent('PUT', { id: 'existing-id', name: 'Updated' });

		await entity.handlers.PUT(event);

		expect(ctx.requireGroupAccessByRecord).not.toHaveBeenCalled();
	});

	it('groupScope with personnelColumn — PUT calls requireGroupAccessByRecord', async () => {
		const mockSupabase = createMockSupabase({
			id: 'existing-id',
			name: 'Updated',
			personnel_id: 'p-1',
			score: 50,
			notes: ''
		});
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const entity = createTestEntity({
			groupScope: { personnelColumn: 'personnel_id' },
			schema: {
				id: field(z.string(), { readOnly: true }),
				name: field(z.string()),
				personnelId: field(z.string(), { column: 'personnel_id', isPersonnelId: true }),
				score: field(z.number().nullable(), { nullDefault: 0 }),
				notes: field(z.string(), { insertDefault: '' })
			}
		});
		const event = mockRequestEvent('PUT', { id: 'existing-id', name: 'Updated' });

		await entity.handlers.PUT(event);

		expect(ctx.requireGroupAccessByRecord).toHaveBeenCalledWith(
			mockSupabase,
			'test_records',
			'existing-id',
			VALID_ORG_ID,
			'personnel_id'
		);
	});
});

describe('entity handlers requireFullEditor', () => {
	it('builds { fullEditor: true } permission spec', async () => {
		const mockSupabase = createMockSupabase({
			id: 'new-id',
			name: 'Test',
			personnel_id: 'p-1',
			score: 0,
			notes: ''
		});
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const entity = createTestEntity({ requireFullEditor: true });
		const event = mockRequestEvent('POST', {
			name: 'Test',
			personnelId: 'p-1',
			score: 0
		});

		await entity.handlers.POST(event);

		expect(ctx.requireFullEditor).toHaveBeenCalled();
		expect(ctx.requireEdit).not.toHaveBeenCalled();
	});
});

describe('entity handlers delete callbacks', () => {
	function createDeleteMockSupabase() {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const mock: any = {
			from: vi.fn()
		};
		const deleteChain = {
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockResolvedValue({ error: null })
			})
		};
		mock.from.mockReturnValue({
			delete: vi.fn().mockReturnValue(deleteChain),
			insert: vi.fn().mockReturnThis(),
			update: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({ data: null, error: null })
		});
		return mock;
	}

	it('onDelete fires before DELETE', async () => {
		const mockSupabase = createDeleteMockSupabase();
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const onDelete = vi.fn().mockResolvedValue(undefined);
		const entity = createTestEntity({ onDelete });
		const event = mockRequestEvent('DELETE', { id: 'del-id' });

		await entity.handlers.DELETE(event);

		expect(onDelete).toHaveBeenCalledWith(mockSupabase, VALID_ORG_ID, 'del-id');
	});

	it('onAfterDelete fires after DELETE with context', async () => {
		const mockSupabase = createDeleteMockSupabase();
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const onAfterDelete = vi.fn().mockResolvedValue(undefined);
		const entity = createTestEntity({ onAfterDelete });
		const event = mockRequestEvent('DELETE', { id: 'del-id' });

		await entity.handlers.DELETE(event);

		expect(onAfterDelete).toHaveBeenCalledWith(
			expect.objectContaining({
				orgId: VALID_ORG_ID,
				userId: 'user-1',
				id: 'del-id'
			})
		);
	});

	it('requireDeletionApproval returns 202 for non-privileged users', async () => {
		const mockSupabase = createDeleteMockSupabase();
		const ctx = mockPermissionContext({ isPrivileged: false, isFullEditor: false });
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const entity = createTestEntity({ requireDeletionApproval: true });
		const event = mockRequestEvent('DELETE', { id: 'del-id' });

		const response = await entity.handlers.DELETE(event);
		const data = await response.json();

		expect(response.status).toBe(202);
		expect(data).toEqual({ requiresApproval: true });
	});

	it('requireDeletionApproval allows privileged users to delete', async () => {
		const mockSupabase = createDeleteMockSupabase();
		const ctx = mockPermissionContext({ isPrivileged: true });
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const entity = createTestEntity({ requireDeletionApproval: true });
		const event = mockRequestEvent('DELETE', { id: 'del-id' });

		const response = await entity.handlers.DELETE(event);

		expect(response.status).toBe(200);
	});
});
