import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing apiRoute
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

import { apiRoute, type ApiRouteContext } from './apiRoute';
import { getApiContext } from '$lib/server/supabase';
import { createPermissionContext } from '$lib/server/permissionContext';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { validateUUID } from '$lib/server/validation';
import type { PermissionContext } from '$lib/server/permissionContext';

const VALID_ORG_ID = '00000000-0000-0000-0000-000000000001';

function mockRequestEvent(orgId: string = VALID_ORG_ID): Parameters<ReturnType<typeof apiRoute>>[0] {
	return {
		params: { orgId },
		locals: {} as App.Locals,
		cookies: {} as never,
		request: new Request('http://localhost/test', { method: 'POST' })
	} as unknown as Parameters<ReturnType<typeof apiRoute>>[0];
}

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
		...overrides
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mocking Supabase's complex generic type
const mockSupabase = {} as any;

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(validateUUID).mockReturnValue(true);
	vi.mocked(checkReadOnly).mockResolvedValue(null);
});

describe('apiRoute permission dispatch', () => {
	it('{ edit: area } calls ctx.requireEdit(area)', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute({ permission: { edit: 'training' } }, async () => new Response('ok'));

		await handler(mockRequestEvent());

		expect(ctx.requireEdit).toHaveBeenCalledWith('training');
	});

	it('{ view: area } calls ctx.requireView(area)', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute({ permission: { view: 'personnel' }, readOnly: false }, async () => new Response('ok'));

		await handler(mockRequestEvent());

		expect(ctx.requireView).toHaveBeenCalledWith('personnel');
	});

	it('{ fullEditor: true } calls ctx.requireFullEditor()', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute({ permission: { fullEditor: true } }, async () => new Response('ok'));

		await handler(mockRequestEvent());

		expect(ctx.requireFullEditor).toHaveBeenCalled();
	});

	it('{ privileged: true } calls ctx.requirePrivileged()', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute({ permission: { privileged: true } }, async () => new Response('ok'));

		await handler(mockRequestEvent());

		expect(ctx.requirePrivileged).toHaveBeenCalled();
	});

	it('{ owner: true } calls ctx.requireOwner()', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute({ permission: { owner: true } }, async () => new Response('ok'));

		await handler(mockRequestEvent());

		expect(ctx.requireOwner).toHaveBeenCalled();
	});

	it('{ custom: fn } calls the custom function with ctx', async () => {
		const ctx = mockPermissionContext();
		const customFn = vi.fn();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute({ permission: { custom: customFn } }, async () => new Response('ok'));

		await handler(mockRequestEvent());

		expect(customFn).toHaveBeenCalledWith(ctx);
	});

	it('{ none: true } still creates permission context for authenticated user', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		let receivedCtx: PermissionContext | null = null;
		const handler = apiRoute({ permission: { none: true } }, async (routeCtx) => {
			receivedCtx = routeCtx.ctx;
			return new Response('ok');
		});

		await handler(mockRequestEvent());

		expect(receivedCtx).toBe(ctx);
	});

	it('{ none: true } skips permission check entirely', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute({ permission: { none: true } }, async () => new Response('ok'));

		await handler(mockRequestEvent());

		expect(ctx.requireEdit).not.toHaveBeenCalled();
		expect(ctx.requireView).not.toHaveBeenCalled();
		expect(ctx.requireFullEditor).not.toHaveBeenCalled();
		expect(ctx.requirePrivileged).not.toHaveBeenCalled();
		expect(ctx.requireOwner).not.toHaveBeenCalled();
	});

	it('{ authenticated: true } creates ctx but skips permission checks', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		let receivedCtx: PermissionContext | undefined;
		const handler = apiRoute({ permission: { authenticated: true } }, async (routeCtx) => {
			receivedCtx = routeCtx.ctx;
			return new Response('ok');
		});

		await handler(mockRequestEvent());

		expect(receivedCtx).toBe(ctx);
		expect(ctx.requireEdit).not.toHaveBeenCalled();
		expect(ctx.requireView).not.toHaveBeenCalled();
		expect(ctx.requirePrivileged).not.toHaveBeenCalled();
	});

	it('{ manageMembers: true } calls ctx.requireManageMembers()', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute({ permission: { manageMembers: true } }, async () => new Response('ok'));

		await handler(mockRequestEvent());

		expect(ctx.requireManageMembers).toHaveBeenCalled();
	});
});

describe('sandbox handling', () => {
	it('sandbox receives synthetic full-access context (non-null)', async () => {
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: null, isSandbox: true });

		let receivedCtx: PermissionContext | null = null;
		const handler = apiRoute({ permission: { edit: 'training' } }, async (routeCtx) => {
			receivedCtx = routeCtx.ctx;
			return new Response('ok');
		});

		await handler(mockRequestEvent());

		expect(createPermissionContext).not.toHaveBeenCalled();
		expect(receivedCtx).not.toBeNull();
		expect(receivedCtx!.isPrivileged).toBe(true);
		expect(receivedCtx!.isOwner).toBe(true);
		expect(receivedCtx!.canEdit.calendar).toBe(true);
		expect(receivedCtx!.canEdit.personnel).toBe(true);
		expect(receivedCtx!.canEdit.training).toBe(true);
		expect(receivedCtx!.canEdit.onboarding).toBe(true);
		expect(receivedCtx!.canEdit['leaders-book']).toBe(true);
		expect(receivedCtx!.canManageMembers).toBe(true);
		expect(receivedCtx!.scopedGroupId).toBeNull();
	});

	it('blockSandbox: true rejects sandbox requests with 403', async () => {
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: null, isSandbox: true });

		const handler = apiRoute({ permission: { edit: 'training' }, blockSandbox: true }, async () => new Response('ok'));

		const response = await handler(mockRequestEvent());

		expect(response.status).toBe(403);
		const body = await response.json();
		expect(body.error).toMatch(/sandbox/i);
	});
});

describe('groupScope enforcement', () => {
	it('calls ctx.requireGroupAccess() when groupScope resolves a personnelId', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute(
			{
				permission: { edit: 'personnel' },
				groupScope: {
					resolvePersonnelId: async () => 'person-123'
				}
			},
			async () => new Response('ok')
		);

		await handler(mockRequestEvent());

		expect(ctx.requireGroupAccess).toHaveBeenCalledWith(mockSupabase, 'person-123');
	});

	it('skips requireGroupAccess when resolvePersonnelId returns null', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute(
			{
				permission: { edit: 'personnel' },
				groupScope: {
					resolvePersonnelId: async () => null
				}
			},
			async () => new Response('ok')
		);

		await handler(mockRequestEvent());

		expect(ctx.requireGroupAccess).not.toHaveBeenCalled();
	});
});

describe('readOnly guard', () => {
	it('readOnly defaults true — calls checkReadOnly', async () => {
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(mockPermissionContext());

		const handler = apiRoute({ permission: { edit: 'training' } }, async () => new Response('ok'));

		await handler(mockRequestEvent());

		expect(checkReadOnly).toHaveBeenCalledWith(mockSupabase, VALID_ORG_ID);
	});

	it('readOnly defaults true — returns blocked response when org is read-only', async () => {
		const blockedResponse = new Response(JSON.stringify({ error: 'read-only' }), { status: 403 });
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(mockPermissionContext());
		vi.mocked(checkReadOnly).mockResolvedValue(blockedResponse);

		const handlerFn = vi.fn();
		const handler = apiRoute({ permission: { edit: 'training' } }, handlerFn);

		const response = await handler(mockRequestEvent());

		expect(response.status).toBe(403);
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it('readOnly: false skips checkReadOnly', async () => {
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(mockPermissionContext());

		const handler = apiRoute({ permission: { view: 'personnel' }, readOnly: false }, async () => new Response('ok'));

		await handler(mockRequestEvent());

		expect(checkReadOnly).not.toHaveBeenCalled();
	});
});

describe('input validation', () => {
	it('rejects invalid orgId with 400', async () => {
		vi.mocked(validateUUID).mockReturnValue(false);

		const handler = apiRoute({ permission: { edit: 'training' } }, async () => new Response('ok'));

		const response = await handler(mockRequestEvent('not-a-uuid'));

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toMatch(/organization/i);
		expect(getApiContext).not.toHaveBeenCalled();
	});

	it('handler receives correct ApiRouteContext shape', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		let receivedRouteCtx: ApiRouteContext | null = null;
		const handler = apiRoute({ permission: { edit: 'training' } }, async (routeCtx) => {
			receivedRouteCtx = routeCtx;
			return new Response('ok');
		});

		await handler(mockRequestEvent());

		expect(receivedRouteCtx).toEqual({
			supabase: mockSupabase,
			orgId: VALID_ORG_ID,
			userId: 'user-1',
			isSandbox: false,
			ctx
		});
	});

	it('throws 401 for unauthenticated non-sandbox requests', async () => {
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: null, isSandbox: false });

		const handler = apiRoute({ permission: { edit: 'training' } }, async () => new Response('ok'));

		await expect(handler(mockRequestEvent())).rejects.toMatchObject({
			status: 401
		});
	});
});
