import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOrgAccessPort } from './supabaseOrgShell';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EffectiveTier } from '$lib/types/subscription';
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

const effectiveTier: EffectiveTier = {
	tier: 'free',
	source: 'default',
	personnelCount: 0,
	personnelCap: 20,
	isReadOnly: false,
	giftExpiresAt: null,
	giftTier: null
};

describe('createSupabaseOrgAccessPort', () => {
	it('throws 403 when the user is not a member of the organization', async () => {
		const { builder, calls } = createMembershipQueryBuilder(null);
		const userSupabase = createMockSupabase(builder);
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase,
			orgName: 'Test Org',
			getEffectiveTier: async () => effectiveTier
		});

		await expect(port.getMembership()).rejects.toMatchObject({
			status: 403,
			body: { message: 'You are not a member of this organization' }
		});

		expect(userSupabase.from as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('organization_memberships');
		expect(calls.map((call) => call.method)).toContain('maybeSingle');
	});

	it('throws 500 on real membership query failures', async () => {
		const { builder } = createMembershipQueryBuilder(null, { code: '42P01', message: 'table not found' });
		const userSupabase = createMockSupabase(builder);
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase,
			orgName: 'Test Org',
			getEffectiveTier: async () => effectiveTier
		});

		await expect(port.getMembership()).rejects.toMatchObject({
			status: 500,
			body: { message: 'table not found' }
		});
	});

	it('returns membership info while allowing the membership loader to be wrapped for request-scoped dedupe', async () => {
		const membershipRow = {
			role: 'member',
			scoped_group_id: 'group-123',
			can_view_calendar: true,
			can_edit_calendar: false,
			can_view_personnel: true,
			can_edit_personnel: true,
			can_view_training: false,
			can_edit_training: false,
			can_view_critical_tasks: false,
			can_edit_critical_tasks: false,
			can_view_onboarding: true,
			can_edit_onboarding: false,
			can_view_rating_scheme: true,
			can_edit_rating_scheme: false,
			can_manage_members: false
		} satisfies MembershipRow;
		const { builder } = createMembershipQueryBuilder(membershipRow);
		const userSupabase = createMockSupabase(builder);
		const wrapMembershipLoad = vi.fn(async (loadMembershipRow: () => Promise<MembershipRow>) => loadMembershipRow());
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase,
			orgName: 'Test Org',
			getEffectiveTier: async () => effectiveTier,
			wrapMembershipLoad
		});

		const result = await port.getMembership();

		expect(wrapMembershipLoad).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			orgId: 'org-1',
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
			permissions: {
				canViewCalendar: true,
				canEditCalendar: false,
				canViewPersonnel: true,
				canEditPersonnel: true,
				canViewTraining: false,
				canEditTraining: false,
				canViewCriticalTasks: false,
				canEditCriticalTasks: false,
				canViewOnboarding: true,
				canEditOnboarding: false,
				canViewRatingScheme: true,
				canEditRatingScheme: false,
				canManageMembers: false
			},
			scopeSet: { kind: 'groups', groupIds: ['group-123'] },
			scopedGroupId: 'group-123',
			orgSuspended: false
		});
	});

	it('prefers stored capability map and Scope Set over legacy permission and scoped group compatibility', async () => {
		const membershipRow = {
			role: 'member',
			scoped_group_id: 'legacy-group',
			can_view_calendar: false,
			can_edit_calendar: false,
			can_view_personnel: false,
			can_edit_personnel: false,
			can_view_training: false,
			can_edit_training: false,
			can_view_critical_tasks: false,
			can_edit_critical_tasks: false,
			can_view_onboarding: false,
			can_edit_onboarding: false,
			can_view_rating_scheme: false,
			can_edit_rating_scheme: false,
			can_manage_members: false,
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
			orgName: 'Test Org',
			getEffectiveTier: async () => effectiveTier
		});

		const result = await port.getMembership();

		expect(result.capabilityMap.training).toBe('operate');
		expect(result.capabilityMap.criticalTasks).toBe('configure');
		expect(result.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] });
		expect(result.scopedGroupId).toBe('legacy-group');
	});

	it('exposes organization-wide configure capability for admin governance roles', async () => {
		const membershipRow = {
			role: 'admin',
			scoped_group_id: 'legacy-group',
			can_view_calendar: false,
			can_edit_calendar: false,
			can_view_personnel: false,
			can_edit_personnel: false,
			can_view_training: false,
			can_edit_training: false,
			can_view_critical_tasks: false,
			can_edit_critical_tasks: false,
			can_view_onboarding: false,
			can_edit_onboarding: false,
			can_view_rating_scheme: false,
			can_edit_rating_scheme: false,
			can_manage_members: false
		} satisfies MembershipRow;
		const { builder } = createMembershipQueryBuilder(membershipRow);
		const port = createSupabaseOrgAccessPort({
			orgId: 'org-1',
			userId: 'user-1',
			userSupabase: createMockSupabase(builder),
			orgName: 'Test Org',
			getEffectiveTier: async () => effectiveTier
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
		expect(result.scopedGroupId).toBeNull();
	});
});
