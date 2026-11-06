import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	createReadyAppShellRouteData,
	createSuspendedAppShellRouteData,
	createOrganizationLoadEventData
} from '../../appShell.test-support';

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

function event(suspended = false, depends = vi.fn(), search = '') {
	return {
		depends,
		url: new URL(`https://app.test/org/test-org/settings/logs${search}`),
		cookies: { get: (name: string) => (name === 't2t_tz' ? 'America/New_York' : undefined) },
		...createOrganizationLoadEventData(
			(suspended ? createSuspendedAppShellRouteData : createReadyAppShellRouteData)({
				orgId: 'org-1',
				orgName: 'Test Org',
				orgUrlSegment: 'test-org'
			})
		)
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

	it('denies a member without admin before constructing privileged readers', async () => {
		admit('member');
		await expect(load(event())).rejects.toMatchObject({ status: 403 });
		expect(getAdminClientMock).not.toHaveBeenCalled();
	});

	it('passes the filters named in the address to the page, and drops values that are not valid', async () => {
		admit('admin');
		getAdminClientMock.mockReturnValue(
			createClient('http://logs.invalid', 'synthetic-privileged-key', {
				auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
				global: { fetch: async () => Response.json([]) }
			})
		);

		const result = (await load(
			event(false, vi.fn(), '?kind=availability.deleted&from=2026-10-01&to=not-a-date&person=nope')
		)) as { logsSettings: { filters: unknown } };

		expect(result.logsSettings.filters).toEqual({ kind: 'availability.deleted', from: '2026-10-01' });
	});

	it.each(['owner', 'admin'] as const)(
		'admits an %s with no feature grants and composes current labels under the requested Organization',
		async (role) => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date('2026-10-20T02:00:00Z'));
			admit(role);
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
			const depends = vi.fn();
			const result = await load(event(false, depends));
			expect(depends).toHaveBeenCalledWith('app:viewer-day');
			expect(result).toMatchObject({
				orgId: 'org-1',
				orgUrlSegment: 'test-org',
				orgName: 'Test Org',
				logsSettings: { timeZone: 'America/New_York', today: '2026-10-19' }
			});
			await expect(
				(result as { logsSettings: { auditLog: Promise<unknown> } }).logsSettings.auditLog
			).resolves.toMatchObject({
				nextCursor: null,
				logs: [{ id: 'event-1', actor: 'owner@example.test', details: { personnel: 'SPC Able Synthetic' } }]
			});
			expect(getAdminClientMock).toHaveBeenCalledOnce();
		}
	);
});
