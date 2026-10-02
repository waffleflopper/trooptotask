import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { readOrganizationMembershipSummaries } from './membershipSummaries.server';
import { createSupabaseDashboardOrgAccessPort } from './dashboardAccessProvider.server';

function provider(rows: Array<Record<string, unknown>>, fail = false) {
	return createClient('http://membership-profile.invalid', 'synthetic-user-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				if (url.pathname !== '/rest/v1/organization_memberships' || init?.method !== 'GET')
					throw new Error('Unexpected provider request');
				if (fail) return Response.json({ message: 'membership read unavailable' }, { status: 500 });
				let selected = rows.filter(
					(row) => !url.searchParams.has('user_id') || url.searchParams.get('user_id') === `eq.${row.user_id}`
				);
				const ordering = url.searchParams.get('order');
				if (ordering) {
					const fields = ordering.split(',').map((field) => field.split('.')[0]);
					selected = selected.toSorted((left, right) => {
						for (const field of fields) {
							const order = String(left[field]).localeCompare(String(right[field]));
							if (order) return order;
						}
						return 0;
					});
				}

				const offset = Number(url.searchParams.get('offset') ?? 0);
				const limit = Number(url.searchParams.get('limit') ?? selected.length);
				return Response.json(selected.slice(offset, offset + limit));
			}
		}
	});
}

describe('Organization membership profile summaries', () => {
	it('reads every caller membership, skips invisible Organizations and preserves slug/UUID link meaning', async () => {
		const visible = Array.from({ length: 1001 }, (_, index) => ({
			id: `membership-${String(index).padStart(4, '0')}`,
			organization_id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
			user_id: 'user-a',
			role: index === 0 ? 'owner' : 'member',
			organizations: {
				id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
				name: `Unit ${index}`,
				url_slug: index === 0 ? 'alpha-unit' : null
			}
		}));
		const supabase = provider([
			...visible.toReversed(),
			{ id: 'hidden', organization_id: 'zz-hidden', user_id: 'user-a', role: 'member', organizations: null },
			{ user_id: 'user-b', role: 'owner', organizations: { id: 'foreign-id', name: 'Foreign', url_slug: 'foreign' } }
		]);
		const result = await readOrganizationMembershipSummaries(supabase, 'user-a');
		expect(result.error).toBeNull();
		expect(result.data).toHaveLength(1001);
		expect(result.data?.[0]).toEqual({
			id: '11111111-1111-4111-8111-000000000000',
			name: 'Unit 0',
			role: 'owner',
			urlSegment: 'alpha-unit'
		});
		expect(result.data?.at(-1)).toEqual({
			id: '11111111-1111-4111-8111-000000001000',
			name: 'Unit 1000',
			role: 'member',
			urlSegment: '11111111-1111-4111-8111-000000001000'
		});
		expect(result.data?.some(({ id }) => id === 'foreign-id')).toBe(false);
	});

	it('retains the Dashboard empty fallback for provider errors', async () => {
		const supabase = provider([], true);
		expect(await createSupabaseDashboardOrgAccessPort({ supabase }).listOrganizationsForUser('user-a')).toEqual([]);
	});
});
