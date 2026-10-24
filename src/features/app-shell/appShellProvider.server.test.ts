import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOrgAccessPort } from './appShellProvider.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationMembershipFacts } from '$lib/access/memberAccessProjection';

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
	it('returns membership info while allowing the membership loader to be wrapped for request-scoped dedupe', async () => {
		const membershipRow = {
			id: 'membership-1',
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: { personnel: 'configure', training: 'none', criticalTasks: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-123']
		} satisfies OrganizationMembershipFacts;
		const { builder } = createMembershipQueryBuilder(membershipRow);
		const userSupabase = createMockSupabase(builder);
		const wrapMembershipLoad = vi.fn(async (loadMembershipRow: () => Promise<OrganizationMembershipFacts>) =>
			loadMembershipRow()
		);
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase,
			orgName: 'Test Org',
			disabledFeatures: [],
			wrapMembershipLoad
		});

		const result = await port.getMembership();

		expect(wrapMembershipLoad).toHaveBeenCalledTimes(1);
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

	it('loads replacement capability map and Scope Set for member access', async () => {
		const membershipRow = {
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: { training: 'operate', criticalTasks: 'configure' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-alpha', 'group-bravo']
		} satisfies OrganizationMembershipFacts;
		const { builder } = createMembershipQueryBuilder(membershipRow);
		const userSupabase = createMockSupabase(builder);
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase,
			orgName: 'Test Org',
			disabledFeatures: []
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
		} satisfies OrganizationMembershipFacts;
		const { builder } = createMembershipQueryBuilder(membershipRow);
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase: createMockSupabase(builder),
			orgName: 'Test Org',
			disabledFeatures: []
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

	it('keeps switched-off features disabled for owners in membership and organization state', async () => {
		const membershipRow = {
			role: 'owner',
			member_preset: 'viewer',
			capability_overrides: {},
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		} satisfies OrganizationMembershipFacts;
		const { builder } = createMembershipQueryBuilder(membershipRow);
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase: createMockSupabase(builder),
			orgName: 'Test Org',
			disabledFeatures: ['training']
		});

		expect((await port.getMembership()).capabilityMap.training).toBe('none');
		expect((await port.getOrgState()).disabledFeatures).toEqual(['training']);
	});

	it('rejects malformed access facts supplied by a request cache instead of exposing member capabilities', async () => {
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase: createMockSupabase(createMembershipQueryBuilder(null).builder),
			orgName: 'Test Org',
			disabledFeatures: [],
			wrapMembershipLoad: async () => ({ role: 'member', member_preset: null })
		});

		await expect(port.getMembership()).rejects.toThrow(
			'Member access projection requires normalized replacement storage'
		);
	});
});

it('composes platform content, account-wide preferences and the profile in parallel across Organizations and recovers each failure fallback', async () => {
	const { createClient } = await import('@supabase/supabase-js');
	const { createSupabaseAppShellFirstPaintChromePort } = await import('./appShellProvider.server');
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
	let preferencesFailed = false;
	let profileFailed = false;
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
				if (url.pathname.endsWith('/user_org_preferences'))
					return preferencesFailed
						? Response.json({ message: 'Preference read unavailable' }, { status: 500 })
						: Response.json({
								user_id: url.searchParams.get('user_id')?.slice(3),
								organization_id: url.searchParams.get('organization_id')?.slice(3),
								preferences: { training: { selectedGroupId: 'group-alpha' } }
							});
				if (url.pathname.endsWith('/user_profiles'))
					return profileFailed
						? Response.json({ message: 'Profile read unavailable' }, { status: 500 })
						: Response.json({
								user_id: url.searchParams.get('user_id')?.slice(3),
								first_name: 'Dana',
								last_name: 'Whitaker',
								rank: 'SFC'
							});
				throw new Error('Unexpected shell provider read');
			}
		}
	});
	const first = createSupabaseAppShellFirstPaintChromePort({
		orgId: 'org-a',
		userId: 'account-a',
		email: 'dana@example.test',
		hasTwoFactor: true,
		userSupabase: client,
		supabase: client
	}).getFirstPaintChrome();
	await Promise.all([startedContent, startedDismissals]);
	release();
	expect((await first).announcements).toEqual([{ id: 'visible', title: 'Current', message: 'Content', type: 'info' }]);
	expect((await first).account).toEqual({
		email: 'dana@example.test',
		hasTwoFactor: true,
		profile: { status: 'loaded', profile: { rank: 'SFC', firstName: 'Dana', lastName: 'Whitaker' } }
	});
	const second = createSupabaseAppShellFirstPaintChromePort({
		orgId: 'org-b',
		userId: 'account-a',
		email: null,
		hasTwoFactor: null,
		userSupabase: client,
		supabase: client
	});
	expect((await second.getFirstPaintChrome()).announcements.map(({ id }) => id)).toEqual(['visible']);
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		preferencesFailed = true;
		const defaults = await second.getFirstPaintChrome();
		expect(defaults.preferences.training.selectedGroupId).toBeNull();
		expect(defaults.announcements.map(({ id }) => id)).toEqual(['visible']);
		preferencesFailed = false;
		failed = true;
		const withoutAnnouncements = await second.getFirstPaintChrome();
		expect(withoutAnnouncements.announcements).toEqual([]);
		expect(withoutAnnouncements.preferences.training.selectedGroupId).toBe('group-alpha');
		failed = false;
		expect((await second.getFirstPaintChrome()).announcements.map(({ id }) => id)).toEqual(['visible']);
		profileFailed = true;
		const withoutProfile = await second.getFirstPaintChrome();
		expect(withoutProfile.account).toEqual({ email: null, hasTwoFactor: null, profile: { status: 'unavailable' } });
		expect(withoutProfile.announcements.map(({ id }) => id)).toEqual(['visible']);
	} finally {
		log.mockRestore();
	}
});

describe('Organization switcher read failure delivery', () => {
	it('reports deferred chrome failure while Dashboard retains its empty fallback', async () => {
		const { createClient } = await import('@supabase/supabase-js');
		const { createSupabaseDashboardOrgAccessPort } = await import('$features/organization/index.server');
		const { createSupabaseAppShellDeferredChromePort } = await import('./appShellProvider.server');
		const { loadAppShellDeferredChrome } = await import('./appShellRead.server');
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
