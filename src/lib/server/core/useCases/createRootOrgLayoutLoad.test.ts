import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import type { AppShellFirstPaintChromePort, OrgAccessPort } from '$lib/server/core/orgShell';
import { createRootOrgLayoutLoad } from './createRootOrgLayoutLoad';

function createOrganizationQuery(row: Record<string, unknown>) {
	const query = {
		eq: vi.fn(),
		maybeSingle: vi.fn().mockResolvedValue({ data: row })
	};
	query.eq.mockReturnValue(query);

	return {
		from: vi.fn().mockReturnValue({
			select: vi.fn().mockReturnValue(query)
		})
	};
}

describe('createRootOrgLayoutLoad', () => {
	it('loads member identity and Group permissions when commercial storage is unavailable', async () => {
		function clientWithRetainedRow(table: string, row: Record<string, unknown>): SupabaseClient {
			return {
				from(requestedTable: string) {
					if (requestedTable !== table) throw new Error(`Storage unavailable: ${requestedTable}`);
					const filters: Record<string, unknown> = {};
					const query = {
						select: () => query,
						eq(column: string, value: unknown) {
							filters[column] = value;
							return query;
						},
						async maybeSingle() {
							return {
								data: Object.entries(filters).every(([column, value]) => row[column] === value) ? row : null,
								error: null
							};
						}
					};
					return query;
				}
			} as unknown as SupabaseClient;
		}
		const supabase = clientWithRetainedRow('organizations', {
			id: 'org-1',
			name: 'Test Unit',
			url_slug: 'test-unit',
			suspended_at: null
		});
		const userSupabase = clientWithRetainedRow('organization_memberships', {
			id: 'membership-1',
			organization_id: 'org-1',
			user_id: 'user-1',
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: { calendar: 'operate' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-alpha']
		});
		const load = createRootOrgLayoutLoad({
			getLayoutClient: () => ({ supabase, userId: 'user-1' }),
			createFirstPaintChromePort: () => ({
				getFirstPaintChrome: async () => ({ announcements: [], preferences: getDefaultUserOrgPreferences() })
			})
		});
		const result = await load({
			params: { orgId: 'test-unit' },
			locals: { actor: { userId: 'user-1' }, user: { id: 'user-1' }, supabase: userSupabase } as unknown as App.Locals,
			cookies: {} as Parameters<typeof load>[0]['cookies'],
			depends: vi.fn(),
			url: new URL('http://localhost/org/test-unit/calendar')
		});
		expect(result.shell).toMatchObject({
			kind: 'ready',
			org: { id: 'org-1', name: 'Test Unit', urlSegment: 'test-unit' },
			user: { id: 'user-1' },
			member: {
				membershipId: 'membership-1',
				role: 'member',
				capabilityMap: { calendar: 'operate', personnel: 'view' },
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			}
		});
		expect(result.shell.state).toEqual({ orgSuspended: false });
	});

	it('loads the App Shell first-paint payload without legacy top-level fields', async () => {
		const supabase = createOrganizationQuery({
			id: 'org-1',
			name: 'Test Unit',
			url_slug: '1-11-bde',
			suspended_at: null
		});
		const userSupabase = { kind: 'user-supabase' };
		const getLayoutClient = vi.fn().mockReturnValue({ supabase });
		const createOrgAccessPort = vi.fn(
			(config: { orgId: string; userId: string; orgName: string }) =>
				({
					getMembership: vi.fn().mockResolvedValue({
						orgId: config.orgId,
						membershipId: 'membership-1',
						userId: config.userId,
						role: 'member',
						capabilityMap: {
							calendar: 'view',
							personnel: 'view',
							training: 'view',
							criticalTasks: 'view',
							onboarding: 'none',
							ratingScheme: 'none'
						},
						scopeSet: { kind: 'organization' }
					}),
					getOrgState: vi.fn().mockImplementation(async () => ({
						orgName: config.orgName
					}))
				}) as OrgAccessPort
		);
		const createFirstPaintChromePort = vi.fn(
			() =>
				({
					getFirstPaintChrome: vi.fn().mockResolvedValue({
						announcements: [],
						preferences: getDefaultUserOrgPreferences()
					})
				}) as AppShellFirstPaintChromePort
		);

		const load = createRootOrgLayoutLoad({
			getLayoutClient,
			createOrgAccessPort,
			createFirstPaintChromePort
		});

		const depends = vi.fn();
		const result = await load({
			params: { orgId: '1-11-bde' },
			locals: {
				actor: { userId: 'user-1' },
				user: { id: 'user-1' },
				supabase: userSupabase
			} as unknown as Parameters<typeof load>[0]['locals'],
			cookies: {
				get: vi.fn().mockReturnValue(undefined)
			} as unknown as Parameters<typeof load>[0]['cookies'],
			depends,
			url: new URL('http://localhost/org/1-11-bde/calendar')
		});

		expect(result).toMatchObject({
			shell: {
				kind: 'ready',
				org: { id: 'org-1', name: 'Test Unit', urlSegment: '1-11-bde' },
				user: { id: 'user-1' },
				state: { orgSuspended: false }
			}
		});
		expect(result).not.toHaveProperty('orgId');
		expect(result).not.toHaveProperty('allOrgs');
		expect(result).not.toHaveProperty('unreadNotificationCount');
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:org-preferences');
		expect(createOrgAccessPort).toHaveBeenCalledWith(
			expect.objectContaining({
				orgId: 'org-1',
				userId: 'user-1',
				userSupabase,
				orgName: 'Test Unit'
			})
		);
		expect(createFirstPaintChromePort).toHaveBeenCalledWith(
			expect.objectContaining({
				orgId: 'org-1',
				userId: 'user-1',
				userSupabase
			})
		);
	});

	it('loads the suspended App Shell path without creating ready-only ports', async () => {
		const supabase = createOrganizationQuery({
			id: 'org-1',
			name: 'Suspended Unit',
			url_slug: null,
			suspended_at: '2026-04-01T00:00:00.000Z'
		});
		const getLayoutClient = vi.fn().mockReturnValue({ supabase });
		const createOrgAccessPort = vi.fn();
		const createFirstPaintChromePort = vi.fn();

		const load = createRootOrgLayoutLoad({
			getLayoutClient,
			createOrgAccessPort,
			createFirstPaintChromePort
		});

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {} as Parameters<typeof load>[0]['locals'],
			cookies: {
				get: vi.fn().mockReturnValue(undefined)
			} as unknown as Parameters<typeof load>[0]['cookies'],
			depends: vi.fn(),
			url: new URL('http://localhost/org/org-1')
		});

		expect(result).toEqual({
			shell: {
				kind: 'suspended',
				org: { id: 'org-1', name: 'Suspended Unit', urlSegment: 'org-1' },
				state: { orgSuspended: true }
			}
		});
		expect(createOrgAccessPort).not.toHaveBeenCalled();
		expect(createFirstPaintChromePort).not.toHaveBeenCalled();
	});
});
