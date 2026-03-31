import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOrgAccessPort } from './supabaseOrgShell';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EffectiveTier } from '$lib/types/subscription';

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
			isDemoReadOnly: false,
			isDemoSandbox: false,
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
			isDemoReadOnly: false,
			isDemoSandbox: false,
			getEffectiveTier: async () => effectiveTier
		});

		await expect(port.getMembership()).rejects.toMatchObject({
			status: 500,
			body: { message: 'table not found' }
		});
	});
});
