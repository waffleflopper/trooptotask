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
vi.mock('$lib/server/auditLog', () => ({
	auditLog: vi.fn(),
	getRequestInfo: vi.fn()
}));

import { apiRoute, type ApiRouteContext } from './apiRoute';
import { getApiContext } from '$lib/server/supabase';
import { createPermissionContext } from '$lib/server/permissionContext';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { validateUUID } from '$lib/server/validation';
import { auditLog, getRequestInfo } from '$lib/server/auditLog';
import type { PermissionContext } from '$lib/server/permissionContext';
import { z } from 'zod';

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

		expect(receivedRouteCtx).toEqual(
			expect.objectContaining({
				supabase: mockSupabase,
				orgId: VALID_ORG_ID,
				userId: 'user-1',
				isSandbox: false,
				ctx
			})
		);
		expect(receivedRouteCtx!.setAuditResourceId).toBeTypeOf('function');
		expect(receivedRouteCtx!.audit).toBeTypeOf('function');
	});

	it('throws 401 for unauthenticated non-sandbox requests', async () => {
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: null, isSandbox: false });

		const handler = apiRoute({ permission: { edit: 'training' } }, async () => new Response('ok'));

		await expect(handler(mockRequestEvent())).rejects.toMatchObject({
			status: 401
		});
	});
});

describe('auto audit logging', () => {
	it('audit config string → writes audit log after 2xx response', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);
		vi.mocked(getRequestInfo).mockReturnValue({ userId: 'user-1', ip: '127.0.0.1', userAgent: 'test' });

		const handler = apiRoute(
			{ permission: { edit: 'calendar' }, audit: 'special_day' },
			async () => new Response(JSON.stringify({ id: '123' }), { status: 200 })
		);

		const event = mockRequestEvent();
		await handler(event);

		expect(auditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'special_day.created',
				resourceType: 'special_day',
				orgId: VALID_ORG_ID
			}),
			expect.objectContaining({ userId: 'user-1' })
		);
	});

	it('audit config object with custom action overrides default', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);
		vi.mocked(getRequestInfo).mockReturnValue({ userId: 'user-1', ip: '127.0.0.1', userAgent: 'test' });

		const handler = apiRoute(
			{
				permission: { edit: 'calendar' },
				audit: { resourceType: 'daily_assignment', action: 'assignment.bulk_updated' }
			},
			async () => new Response('ok', { status: 200 })
		);

		await handler(mockRequestEvent());

		expect(auditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'assignment.bulk_updated',
				resourceType: 'daily_assignment'
			}),
			expect.anything()
		);
	});

	it('does NOT write audit log when handler returns 4xx', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute(
			{ permission: { edit: 'calendar' }, audit: 'special_day' },
			async () => new Response(JSON.stringify({ error: 'bad' }), { status: 400 })
		);

		await handler(mockRequestEvent());

		expect(auditLog).not.toHaveBeenCalled();
	});

	it('ctx.audit() writes manually and suppresses auto-audit', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);
		vi.mocked(getRequestInfo).mockReturnValue({ userId: 'user-1', ip: '127.0.0.1', userAgent: 'test' });

		const handler = apiRoute({ permission: { edit: 'personnel' }, audit: 'personnel' }, async (routeCtx) => {
			routeCtx.audit('personnel.archived', { reason: 'ETS' }, 'person-1');
			return new Response('ok', { status: 200 });
		});

		await handler(mockRequestEvent());

		// manual audit was called
		expect(auditLog).toHaveBeenCalledTimes(1);
		expect(auditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'personnel.archived',
				resourceId: 'person-1',
				details: { reason: 'ETS' }
			}),
			expect.anything()
		);
	});

	it('setAuditResourceId sets resourceId on auto-audit entry', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);
		vi.mocked(getRequestInfo).mockReturnValue({ userId: 'user-1', ip: '127.0.0.1', userAgent: 'test' });

		const handler = apiRoute({ permission: { edit: 'calendar' }, audit: 'special_day' }, async (routeCtx) => {
			routeCtx.setAuditResourceId('sd-456');
			return new Response('ok', { status: 200 });
		});

		await handler(mockRequestEvent());

		expect(auditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				resourceId: 'sd-456'
			}),
			expect.anything()
		);
	});

	it('detailFields extracts named fields from body into audit details', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);
		vi.mocked(getRequestInfo).mockReturnValue({ userId: 'user-1', ip: '127.0.0.1', userAgent: 'test' });

		const handler = apiRoute(
			{
				permission: { edit: 'calendar' },
				audit: { resourceType: 'special_day', detailFields: ['name', 'date'] }
			},
			async () => new Response('ok', { status: 200 })
		);

		const event = mockRequestEvent();
		// Override the request with a body
		Object.defineProperty(event, 'request', {
			value: new Request('http://localhost/test', {
				method: 'POST',
				body: JSON.stringify({ name: 'Holiday', date: '2026-12-25', type: 'holiday' }),
				headers: { 'content-type': 'application/json' }
			})
		});

		await handler(event);

		expect(auditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				details: { name: 'Holiday', date: '2026-12-25' }
			}),
			expect.anything()
		);
	});

	it('audit failure does not break the response', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);
		vi.mocked(getRequestInfo).mockReturnValue({ userId: 'user-1', ip: '127.0.0.1', userAgent: 'test' });
		vi.mocked(auditLog).mockImplementation(() => {
			throw new Error('DB connection lost');
		});

		const handler = apiRoute(
			{ permission: { edit: 'calendar' }, audit: 'special_day' },
			async () => new Response('ok', { status: 200 })
		);

		const response = await handler(mockRequestEvent());

		expect(response.status).toBe(200);
	});

	it('auto-parses body when audit config present', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);
		vi.mocked(getRequestInfo).mockReturnValue({ userId: 'user-1', ip: '127.0.0.1', userAgent: 'test' });

		let receivedBody: unknown;
		const handler = apiRoute(
			{
				permission: { edit: 'calendar' },
				audit: { resourceType: 'special_day', detailFields: ['name'] }
			},
			async (routeCtx) => {
				receivedBody = routeCtx.body;
				return new Response('ok', { status: 200 });
			}
		);

		const event = mockRequestEvent();
		Object.defineProperty(event, 'request', {
			value: new Request('http://localhost/test', {
				method: 'POST',
				body: JSON.stringify({ name: 'Holiday' }),
				headers: { 'content-type': 'application/json' }
			})
		});

		await handler(event);

		expect(receivedBody).toEqual({ name: 'Holiday' });
	});

	it('does NOT write audit log when no audit config', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute({ permission: { edit: 'calendar' } }, async () => new Response('ok', { status: 200 }));

		await handler(mockRequestEvent());

		expect(auditLog).not.toHaveBeenCalled();
	});
});

describe('schema validation', () => {
	const TestSchema = z.object({
		name: z.string().min(1),
		date: z.string(),
		count: z.number().optional()
	});

	it('valid body → handler receives typed body on context', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		let receivedBody: unknown;
		const handler = apiRoute({ permission: { edit: 'calendar' }, schema: TestSchema }, async (routeCtx) => {
			receivedBody = routeCtx.body;
			return new Response('ok', { status: 200 });
		});

		const event = mockRequestEvent();
		Object.defineProperty(event, 'request', {
			value: new Request('http://localhost/test', {
				method: 'POST',
				body: JSON.stringify({ name: 'Holiday', date: '2026-12-25' }),
				headers: { 'content-type': 'application/json' }
			})
		});

		const response = await handler(event);

		expect(response.status).toBe(200);
		expect(receivedBody).toEqual({ name: 'Holiday', date: '2026-12-25' });
	});

	it('invalid body → returns 400 with field-level errors', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handlerFn = vi.fn();
		const handler = apiRoute({ permission: { edit: 'calendar' }, schema: TestSchema }, handlerFn);

		const event = mockRequestEvent();
		Object.defineProperty(event, 'request', {
			value: new Request('http://localhost/test', {
				method: 'POST',
				body: JSON.stringify({ name: '', count: 'not-a-number' }),
				headers: { 'content-type': 'application/json' }
			})
		});

		const response = await handler(event);

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('Validation error');
		expect(body.issues).toBeDefined();
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it('malformed JSON → returns 400', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handlerFn = vi.fn();
		const handler = apiRoute({ permission: { edit: 'calendar' }, schema: TestSchema }, handlerFn);

		const event = mockRequestEvent();
		Object.defineProperty(event, 'request', {
			value: new Request('http://localhost/test', {
				method: 'POST',
				body: 'not json at all{{{',
				headers: { 'content-type': 'application/json' }
			})
		});

		const response = await handler(event);

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toMatch(/invalid/i);
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it('no schema → handler works normally without body on context', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		let receivedBody: unknown = 'sentinel';
		const handler = apiRoute({ permission: { edit: 'calendar' } }, async (routeCtx) => {
			receivedBody = routeCtx.body;
			return new Response('ok', { status: 200 });
		});

		await handler(mockRequestEvent());

		expect(receivedBody).toBeUndefined();
	});
});

describe('scopeByPersonnel', () => {
	function mockRequestWithBody(body: Record<string, unknown>) {
		const event = mockRequestEvent();
		Object.defineProperty(event, 'request', {
			value: new Request('http://localhost/test', {
				method: 'POST',
				body: JSON.stringify(body),
				headers: { 'content-type': 'application/json' }
			})
		});
		return event;
	}

	it('scoped user → calls requireGroupAccess with personnel ID from body', async () => {
		const ctx = mockPermissionContext({ scopedGroupId: 'group-1' });
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute(
			{ permission: { edit: 'personnel' }, scopeByPersonnel: 'personnel_id' },
			async () => new Response('ok', { status: 200 })
		);

		await handler(mockRequestWithBody({ personnelId: 'person-abc' }));

		expect(ctx.requireGroupAccess).toHaveBeenCalledWith(mockSupabase, 'person-abc');
	});

	it('admin/owner (no scopedGroupId) → skips group check', async () => {
		const ctx = mockPermissionContext({ scopedGroupId: null, isPrivileged: true });
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute(
			{ permission: { edit: 'personnel' }, scopeByPersonnel: 'personnel_id' },
			async () => new Response('ok', { status: 200 })
		);

		await handler(mockRequestWithBody({ personnelId: 'person-abc' }));

		expect(ctx.requireGroupAccess).not.toHaveBeenCalled();
	});

	it('missing personnel ID in body → returns 400', async () => {
		const ctx = mockPermissionContext({ scopedGroupId: 'group-1' });
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handlerFn = vi.fn();
		const handler = apiRoute({ permission: { edit: 'personnel' }, scopeByPersonnel: 'personnel_id' }, handlerFn);

		const response = await handler(mockRequestWithBody({ name: 'no personnel id here' }));

		expect(response.status).toBe(400);
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it('existing groupScope callback still works alongside scopeByPersonnel', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(getApiContext).mockReturnValue({ supabase: mockSupabase, userId: 'user-1', isSandbox: false });
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		const handler = apiRoute(
			{
				permission: { edit: 'personnel' },
				groupScope: { resolvePersonnelId: async () => 'person-from-callback' }
			},
			async () => new Response('ok', { status: 200 })
		);

		await handler(mockRequestEvent());

		expect(ctx.requireGroupAccess).toHaveBeenCalledWith(mockSupabase, 'person-from-callback');
	});
});
