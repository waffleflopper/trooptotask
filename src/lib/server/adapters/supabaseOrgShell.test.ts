import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOrgAccessPort } from './supabaseOrgShell';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MembershipRow } from '$lib/server/permissionContext';

type Call = { method: string; args: unknown[] };

function createMembershipQueryBuilder(returnData: unknown, returnError: unknown = null) {
	const calls: Call[] = [];

	function track(method: string) {
		return (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}

	const result = { data: returnData, error: returnError };

	const builder: Record<string, unknown> = {
		select: track('select'),
		eq: track('eq'),
		maybeSingle: (...args: unknown[]) => {
			calls.push({ method: 'maybeSingle', args });
			return result;
		}
	};

	return { builder, calls };
}

function createMockSupabase(builder: Record<string, unknown>): SupabaseClient {
	return {
		from: vi.fn(() => builder)
	} as unknown as SupabaseClient;
}

describe('createSupabaseOrgAccessPort', () => {
	it('throws 403 when the user is not a member of the organization', async () => {
		const { builder, calls } = createMembershipQueryBuilder(null);
		const userSupabase = createMockSupabase(builder);
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase,
			orgName: 'Test Org'
		});

		await expect(port.getMembership()).rejects.toMatchObject({
			status: 403,
			body: { message: 'You are not a member of this organization' }
		});

		expect(userSupabase.from as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('organization_memberships');
		expect(calls.map((call) => call.method)).toContain('maybeSingle');
	});

	it('throws 500 on real membership query failures', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { builder } = createMembershipQueryBuilder(null, { code: '42P01', message: 'table not found' });
		const userSupabase = createMockSupabase(builder);
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase,
			orgName: 'Test Org'
		});

		try {
			const thrown = await port.getMembership().catch((error: unknown) => error);

			expect(thrown).toMatchObject({
				status: 500,
				body: { message: 'Internal server error' }
			});
			expect(JSON.stringify(thrown)).not.toContain('table not found');
			expect(consoleError).toHaveBeenCalledWith(
				'[supabase-org-shell] Failed to load membership row:',
				expect.stringContaining('table not found')
			);
		} finally {
			consoleError.mockRestore();
		}
	});

	it('returns membership info while allowing the membership loader to be wrapped for request-scoped dedupe', async () => {
		const membershipRow = {
			id: 'membership-1',
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: { personnel: 'configure', training: 'none', criticalTasks: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-123']
		} satisfies MembershipRow;
		const { builder, calls } = createMembershipQueryBuilder(membershipRow);
		const userSupabase = createMockSupabase(builder);
		const wrapMembershipLoad = vi.fn(async (loadMembershipRow: () => Promise<MembershipRow>) => loadMembershipRow());
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase,
			orgName: 'Test Org',
			wrapMembershipLoad
		});

		const result = await port.getMembership();

		expect(wrapMembershipLoad).toHaveBeenCalledTimes(1);
		const selectCall = calls.find((call) => call.method === 'select');
		expect(selectCall?.args[0]).toBe(
			'id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids'
		);
		expect(result).toEqual({
			orgId: 'org-1',
			membershipId: 'membership-1',
			userId: 'user-1',
			role: 'member',
			capabilityMap: {
				calendar: 'view',
				personnel: 'configure',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'view',
				ratingScheme: 'view'
			},
			scopeSet: { kind: 'groups', groupIds: ['group-123'] },
			orgSuspended: false
		});
	});

	it.each([null, 'custom'] as const)(
		'fails visibly when shell membership rows have invalid normalized preset %s',
		async (memberPreset) => {
			const { builder } = createMembershipQueryBuilder({
				id: 'membership-1',
				role: 'member',
				member_preset: memberPreset,
				capability_overrides: {},
				access_scope_kind: 'organization',
				access_scope_group_ids: []
			});
			const port = createSupabaseOrgAccessPort({
				orgId: 'org-1',
				userId: 'user-1',
				userSupabase: createMockSupabase(builder),
				orgName: 'Test Org'
			});

			await expect(port.getMembership()).rejects.toMatchObject({
				status: 500,
				body: { message: 'Membership row is missing normalized member access storage' }
			});
		}
	);

	it('loads replacement capability map and Scope Set for member access', async () => {
		const membershipRow = {
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: { training: 'operate', criticalTasks: 'configure' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-alpha', 'group-bravo']
		} satisfies MembershipRow;
		const { builder } = createMembershipQueryBuilder(membershipRow);
		const userSupabase = createMockSupabase(builder);
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase,
			orgName: 'Test Org'
		});

		const result = await port.getMembership();

		expect(result.capabilityMap.training).toBe('operate');
		expect(result.capabilityMap.criticalTasks).toBe('configure');
		expect(result.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] });
	});

	it('exposes organization-wide configure capability for admin governance roles', async () => {
		const membershipRow = {
			role: 'admin',
			member_preset: 'viewer',
			capability_overrides: {},
			access_scope_kind: 'groups',
			access_scope_group_ids: ['ignored-for-admin']
		} satisfies MembershipRow;
		const { builder } = createMembershipQueryBuilder(membershipRow);
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase: createMockSupabase(builder),
			orgName: 'Test Org'
		});

		const result = await port.getMembership();

		expect(result.capabilityMap).toEqual({
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		});
		expect(result.scopeSet).toEqual({ kind: 'organization' });
	});
});

it('composes platform content and account-wide preferences in parallel across Organizations and recovers its failure fallback', async () => {
	const { createClient } = await import('@supabase/supabase-js');
	const { createSupabaseAppShellFirstPaintChromePort } = await import('./supabaseOrgShell');
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	let contentStarted!: () => void, dismissalStarted!: () => void;
	const startedContent = new Promise<void>((resolve) => {
		contentStarted = resolve;
	});
	const startedDismissals = new Promise<void>((resolve) => {
		dismissalStarted = resolve;
	});
	let failed = false;
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.pathname.endsWith('/platform_announcements')) {
					contentStarted();
					await pending;
					return Response.json([
						{ id: 'visible', title: 'Current', message: 'Content', type: 'info' },
						{ id: 'dismissed', title: 'Dismissed', message: 'Content', type: 'info' }
					]);
				}
				if (url.pathname.endsWith('/announcement_dismissals')) {
					dismissalStarted();
					await pending;
					if (failed) return Response.json({ message: 'Unavailable' }, { status: 403 });
					const rows = [
						{ user_id: 'account-a', announcement_id: 'dismissed' },
						{ user_id: 'peer', announcement_id: 'visible' }
					];
					return Response.json(
						rows
							.filter((row) => `eq.${row.user_id}` === url.searchParams.get('user_id'))
							.map(({ announcement_id }) => ({ announcement_id }))
					);
				}
				if (url.pathname.endsWith('/user_org_preferences')) return Response.json(null);
				throw new Error('Unexpected shell provider read');
			}
		}
	});
	const first = createSupabaseAppShellFirstPaintChromePort({
		orgId: 'org-a',
		userId: 'account-a',
		userSupabase: client,
		supabase: client
	}).getFirstPaintChrome();
	await Promise.all([startedContent, startedDismissals]);
	release();
	expect((await first).announcements).toEqual([{ id: 'visible', title: 'Current', message: 'Content', type: 'info' }]);
	const second = createSupabaseAppShellFirstPaintChromePort({
		orgId: 'org-b',
		userId: 'account-a',
		userSupabase: client,
		supabase: client
	});
	expect((await second.getFirstPaintChrome()).announcements.map(({ id }) => id)).toEqual(['visible']);
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		failed = true;
		expect((await second.getFirstPaintChrome()).announcements).toEqual([]);
		failed = false;
		expect((await second.getFirstPaintChrome()).announcements.map(({ id }) => id)).toEqual(['visible']);
	} finally {
		log.mockRestore();
	}
});

describe('Organization switcher read failure delivery', () => {
	it('reports deferred chrome failure while Dashboard retains its empty fallback', async () => {
		const { createClient } = await import('@supabase/supabase-js');
		const { createSupabaseDashboardOrgAccessPort } = await import('$features/organization/index.server');
		const { createSupabaseAppShellDeferredChromePort } = await import('./supabaseOrgShell');
		const { loadAppShellDeferredChrome } = await import('../core/useCases/loadAppShell');
		const client = createClient('http://switcher.invalid', 'synthetic-user-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					if (url.pathname !== '/rest/v1/organization_memberships' || init?.method !== 'GET')
						throw new Error('Unexpected provider request');
					return Response.json({ message: 'membership read unavailable' }, { status: 500 });
				}
			}
		});
		expect(await createSupabaseDashboardOrgAccessPort({ supabase: client }).listOrganizationsForUser('user-a')).toEqual(
			[]
		);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect(
				await loadAppShellDeferredChrome(
					'organization-switcher',
					createSupabaseAppShellDeferredChromePort({ orgId: 'org-a', userId: 'user-a', userSupabase: client })
				)
			).toMatchObject({ part: 'organization-switcher', ok: false });
		} finally {
			consoleError.mockRestore();
		}
	});
});
