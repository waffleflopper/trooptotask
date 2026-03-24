import { describe, it, expect, vi } from 'vitest';

// The HTTP adapter functions call buildContext which requires SvelteKit internals
// (getApiContext, createPermissionContext, etc). We test postHandler/deleteHandler/putHandler
// by mocking buildContext and verifying the HTTP bridge logic in isolation.

// We test the use-case-wrapping behavior: JSON parsing, error handling, response shape.
// buildContext is integration-tested separately since it touches real Supabase wiring.

vi.mock('./supabaseDataStore', () => ({
	createSupabaseDataStore: vi.fn()
}));
vi.mock('./supabaseAuthContext', () => ({
	createSupabaseAuthContextAdapter: vi.fn(() => ({
		userId: 'test-user',
		orgId: '00000000-0000-0000-0000-000000000001',
		role: 'owner',
		isPrivileged: true,
		isFullEditor: true,
		scopedGroupId: null,
		requireEdit() {},
		requireView() {},
		requirePrivileged() {},
		requireOwner() {},
		requireFullEditor() {},
		requireManageMembers() {},
		async requireGroupAccess() {},
		async requireGroupAccessBatch() {},
		async requireGroupAccessByRecord() {}
	})),
	createSandboxAuthContext: vi.fn()
}));
vi.mock('./supabaseAudit', () => ({
	createSupabaseAuditAdapter: vi.fn()
}));
vi.mock('./supabaseReadOnlyGuard', () => ({
	createSupabaseReadOnlyGuard: vi.fn()
}));
vi.mock('./scopedDataStore', () => ({
	createScopedDataStore: vi.fn((_inner: unknown) => ({}))
}));
vi.mock('./scopeRules', () => ({
	defaultScopeRules: new Map()
}));
vi.mock('$lib/server/supabase', () => ({
	getApiContext: vi.fn(() => ({ supabase: {}, userId: 'test-user', isSandbox: false }))
}));
vi.mock('$lib/server/permissionContext', () => ({
	createPermissionContext: vi.fn(async () => ({
		role: 'owner',
		isPrivileged: true,
		isFullEditor: true,
		scopedGroupId: null,
		requireEdit() {},
		requireView() {},
		requirePrivileged() {},
		requireOwner() {},
		requireFullEditor() {},
		requireManageMembers() {},
		async requireGroupAccess() {},
		async requireGroupAccessBatch() {},
		async requireGroupAccessByRecord() {}
	})),
	createSandboxContext: vi.fn()
}));
vi.mock('$lib/server/validation', () => ({
	validateUUID: vi.fn(() => true)
}));
vi.mock('$lib/server/auditLog', () => ({
	getRequestInfo: vi.fn(() => ({ userId: 'test-user', ip: '127.0.0.1', userAgent: 'test' }))
}));

import { postHandler, deleteHandler, putHandler } from './httpAdapter';

function createMockEvent(body: unknown): {
	params: { orgId: string };
	cookies: { get: () => string | undefined };
	locals: { user: { id: string }; supabase: object };
	request: Request;
	getClientAddress: () => string;
} {
	return {
		params: { orgId: '00000000-0000-0000-0000-000000000001' },
		cookies: { get: () => undefined },
		locals: { user: { id: 'test-user' }, supabase: {} },
		request: new Request('http://localhost', {
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'Content-Type': 'application/json' }
		}),
		getClientAddress: () => '127.0.0.1'
	};
}

describe('postHandler', () => {
	it('parses JSON body, calls use case, and returns JSON response', async () => {
		const useCase = vi.fn(async (_ctx, data) => ({ id: 'new-1', ...data }));
		const handler = postHandler(useCase);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const response = await handler(createMockEvent({ name: 'test' }) as any);

		expect(response.status).toBe(200);
		const responseBody = await response.json();
		expect(responseBody).toMatchObject({ id: 'new-1', name: 'test' });
		expect(useCase).toHaveBeenCalledTimes(1);
	});

	it('re-throws SvelteKit HttpErrors', async () => {
		const { error } = await import('@sveltejs/kit');
		const useCase = vi.fn(async () => {
			throw error(403, 'Forbidden');
		});
		const handler = postHandler(useCase);

		await expect(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			handler(createMockEvent({ name: 'test' }) as any)
		).rejects.toMatchObject({ status: 403 });
	});

	it('wraps non-SvelteKit errors as 500', async () => {
		const useCase = vi.fn(async () => {
			throw new TypeError('something broke');
		});
		const handler = postHandler(useCase);

		await expect(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			handler(createMockEvent({ name: 'test' }) as any)
		).rejects.toMatchObject({ status: 500 });
	});
});

describe('deleteHandler', () => {
	it('extracts id from body, calls use case, and returns success', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const useCase = vi.fn(async (_ctx: any, _id: string) => {});
		const handler = deleteHandler(useCase);

		const response = await handler(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			createMockEvent({ id: '00000000-0000-0000-0000-000000000002' }) as any
		);

		expect(response.status).toBe(200);
		const responseBody = await response.json();
		expect(responseBody).toEqual({ success: true });
		expect(useCase).toHaveBeenCalledTimes(1);
		expect(useCase.mock.calls[0][1]).toBe('00000000-0000-0000-0000-000000000002');
	});

	it('rejects missing id', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const useCase = vi.fn(async (_ctx: any, _id: string) => {});
		const handler = deleteHandler(useCase);

		await expect(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			handler(createMockEvent({}) as any)
		).rejects.toMatchObject({ status: 400 });
	});
});

describe('putHandler', () => {
	it('parses JSON body, calls use case, and returns JSON response', async () => {
		const useCase = vi.fn(async (_ctx, data) => ({ ...data, updated: true }));
		const handler = putHandler(useCase);

		const response = await handler(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			createMockEvent({ id: 'rec-1', name: 'updated' }) as any
		);

		expect(response.status).toBe(200);
		const responseBody = await response.json();
		expect(responseBody).toMatchObject({ id: 'rec-1', name: 'updated', updated: true });
	});
});
