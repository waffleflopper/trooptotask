import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createReadyAppShellRouteData, createSuspendedAppShellRouteData } from '../../appShell.test-support';

const { getAdminClientMock, loadWithContextMock } = vi.hoisted(() => ({
	getAdminClientMock: vi.fn(),
	loadWithContextMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return { ...actual, loadWithContext: loadWithContextMock };
});

vi.mock('$lib/server/supabase', () => ({ getAdminClient: getAdminClientMock }));

import { load } from './+page.server';
import { loadWithContextCore } from '$lib/server/adapters/httpAdapter';

function event(suspended = false) {
	return {
		locals: {},
		cookies: { get: (name: string) => (name === 't2t_tz' ? 'America/New_York' : undefined) },
		parent: async () =>
			(suspended ? createSuspendedAppShellRouteData : createReadyAppShellRouteData)({
				orgId: 'org-1',
				orgName: 'Test Org',
				orgUrlSegment: 'test-org'
			})
	} as never;
}

function admit(role: 'owner' | 'admin' | 'member') {
	const ctx = createTestContext({
		auth: {
			orgId: 'org-1',
			role,
			isPrivileged: role !== 'member',
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet: { kind: 'organization' }
		}
	});
	loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
		loadWithContextCore(ctx, config, () => config.context(ctx))
	);
}

describe('logs settings page server', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.useRealTimers());

	it('returns no page data for a suspended Organization without constructing privileged readers', async () => {
		expect(await load(event(true))).toEqual({});
		expect(loadWithContextMock).not.toHaveBeenCalled();
		expect(getAdminClientMock).not.toHaveBeenCalled();
	});

	it.each(['admin', 'member'] as const)('denies %s before constructing privileged readers', async (role) => {
		admit(role);
		await expect(load(event())).rejects.toMatchObject({ status: 403 });
		expect(getAdminClientMock).not.toHaveBeenCalled();
	});

	it('admits an owner with no feature grants and composes current labels under the requested Organization', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-20T02:00:00Z'));
		admit('owner');
		const person = '11111111-1111-4111-8111-111111111111';
		getAdminClientMock.mockReturnValue(
			createClient('http://logs.invalid', 'synthetic-privileged-key', {
				auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
				global: {
					fetch: async (input, init) => {
						const request = new Request(input, init);
						const url = new URL(request.url);
						if (url.pathname.endsWith('/list_audit_log_actions'))
							return Response.json([{ action: 'personnel.updated' }]);
						const column = url.pathname.endsWith('/audit_logs') ? 'org_id' : 'organization_id';
						if (url.searchParams.get(column) !== 'eq.org-1') throw new Error('Unexpected Organization');
						if (url.pathname.endsWith('/personnel'))
							return Response.json([{ id: person, rank: 'SPC', last_name: 'Able', first_name: 'Synthetic' }]);
						if (url.pathname.endsWith('/organization_memberships'))
							return Response.json([{ user_id: 'owner-actor', email: 'owner@example.test' }]);
						if (!url.pathname.endsWith('/audit_logs')) throw new Error('Unexpected source');
						return new Response(
							request.method === 'HEAD'
								? null
								: JSON.stringify([
										{
											id: 'event-1',
											user_id: 'owner-actor',
											action: 'personnel.updated',
											resource_type: 'personnel',
											resource_id: person,
											details: { personnel_id: person },
											timestamp: '2026-10-01T12:00:00Z'
										}
									]),
							{ headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } }
						);
					}
				}
			})
		);
		const result = await load(event());
		expect(result).toMatchObject({
			orgId: 'org-1',
			orgUrlSegment: 'test-org',
			orgName: 'Test Org',
			logsSettings: {
				timeZone: 'America/New_York',
				today: '2026-10-19',
				auditLog: {
					page: 1,
					limit: 100,
					totalCount: 1,
					logs: [{ id: 'event-1', actor: 'owner@example.test', details: { personnel: 'SPC Able Synthetic' } }]
				}
			}
		});
		expect(getAdminClientMock).toHaveBeenCalledOnce();
	});
});
