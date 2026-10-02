import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOrganizationAdministratorRecipients } from './administratorRecipients.server';

interface Membership {
	organization_id: string;
	user_id: string;
	role: string;
}

function recipientProvider(memberships: Membership[]) {
	const state = { memberships, failFrom: null as number | null };
	const client = createClient('http://127.0.0.1:9', 'synthetic-service-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input) => {
				const url = new URL(String(input));
				if (url.pathname !== '/rest/v1/organization_memberships') throw new Error('Unexpected table');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.failFrom != null && offset >= state.failFrom) {
					return Response.json({ code: '42501', message: 'membership unavailable' }, { status: 403 });
				}
				const roleFilter = url.searchParams.get('role');
				const roles = roleFilter?.slice(4, -1).split(',') ?? [];
				const rows = state.memberships.filter(
					(row) =>
						(!url.searchParams.has('organization_id') ||
							url.searchParams.get('organization_id') === `eq.${row.organization_id}`) &&
						(!roleFilter || roles.includes(row.role))
				);
				const limit = Number(url.searchParams.get('limit') ?? 1000);
				return Response.json(rows.slice(offset, offset + Math.min(limit, 1000)).map(({ user_id }) => ({ user_id })));
			}
		}
	});
	return { state, resolve: createSupabaseOrganizationAdministratorRecipients(() => client) };
}

describe('Organization administrator recipients', () => {
	it('resolves current owners/admins beyond one provider page without another Organization or ordinary members', async () => {
		const adminIds = Array.from({ length: 1000 }, (_, index) => `admin-${index}`);
		const provider = recipientProvider([
			...adminIds.map((user_id) => ({ organization_id: 'org-a', user_id, role: 'admin' })),
			{ organization_id: 'org-a', user_id: 'owner-last', role: 'owner' },
			{ organization_id: 'org-a', user_id: 'ordinary-member', role: 'member' },
			{ organization_id: 'org-b', user_id: 'foreign-owner', role: 'owner' }
		]);
		expect(await provider.resolve('org-a')).toEqual({ userIds: [...adminIds, 'owner-last'], errorMessage: null });
	});

	it('uses changed memberships on each lookup, including an empty audience', async () => {
		const provider = recipientProvider([
			{ organization_id: 'org-a', user_id: 'old-admin', role: 'admin' },
			{ organization_id: 'org-a', user_id: 'new-owner', role: 'member' }
		]);
		expect((await provider.resolve('org-a')).userIds).toEqual(['old-admin']);
		provider.state.memberships[0].role = 'member';
		provider.state.memberships[1].role = 'owner';
		expect((await provider.resolve('org-a')).userIds).toEqual(['new-owner']);
		expect(await provider.resolve('org-b')).toEqual({ userIds: [], errorMessage: null });
	});

	it('discards a partial page on returned lookup failure and allows an explicit later lookup', async () => {
		const provider = recipientProvider(
			Array.from({ length: 1001 }, (_, index) => ({
				organization_id: 'org-a',
				user_id: `admin-${index}`,
				role: 'admin'
			}))
		);
		provider.state.failFrom = 1000;
		expect(await provider.resolve('org-a')).toEqual({ userIds: [], errorMessage: 'membership unavailable' });
		provider.state.failFrom = null;
		expect((await provider.resolve('org-a')).userIds).toHaveLength(1001);
	});
});
