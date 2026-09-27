import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelOnboardingRosterPort } from './onboardingRoster.server';

const rows = [
	{
		id: 'active-alpha',
		organization_id: 'org-1',
		group_id: 'alpha',
		archived_at: null,
		slug: 'active-alpha',
		rank: 'SGT',
		last_name: 'Able',
		first_name: 'Ann',
		clinic_role: '',
		groups: { name: 'Alpha' }
	},
	{
		id: 'archived-alpha',
		organization_id: 'org-1',
		group_id: 'alpha',
		archived_at: '2026-01-02',
		slug: 'archived-alpha',
		rank: 'SPC',
		last_name: 'Baker',
		first_name: 'Ben',
		clinic_role: '',
		groups: { name: 'Alpha' }
	},
	{
		id: 'bravo',
		organization_id: 'org-1',
		group_id: 'bravo',
		archived_at: null,
		slug: 'bravo',
		rank: 'CPL',
		last_name: 'Clark',
		first_name: 'Cal',
		clinic_role: '',
		groups: { name: 'Bravo' }
	},
	{
		id: 'other-org',
		organization_id: 'org-2',
		group_id: 'alpha',
		archived_at: null,
		slug: 'other-org',
		rank: 'SGT',
		last_name: 'Davis',
		first_name: 'Dee',
		clinic_role: '',
		groups: { name: 'Alpha' }
	}
];

function provider() {
	const from = vi.fn(() => {
		let result = rows.slice();
		const query = {
			select: () => query,
			eq: (column: string, value: unknown) => {
				result = result.filter((row) => row[column as keyof typeof row] === value);
				return query;
			},
			is: (column: string, value: unknown) => {
				result = result.filter((row) => row[column as keyof typeof row] === value);
				return query;
			},
			in: (column: string, values: string[]) => {
				result = result.filter((row) => values.includes(row[column as keyof typeof row] as string));
				return query;
			},
			order: () => query,
			range: (start: number, end: number) => Promise.resolve({ data: result.slice(start, end + 1), error: null })
		};
		return query;
	});
	const getAdminClient = vi.fn(() => ({ from }) as unknown as SupabaseClient);
	return { from, getAdminClient, port: createSupabasePersonnelOnboardingRosterPort(getAdminClient) };
}

function actor(onboarding: 'none' | 'view' = 'view', groupIds: string[] = ['alpha']) {
	return createTestAuthContext({
		orgId: 'org-1',
		role: 'member',
		isPrivileged: false,
		scopeSet: { kind: 'groups', groupIds },
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding,
			ratingScheme: 'none'
		}
	});
}

describe('Personnel Onboarding roster provider', () => {
	it('gives an Onboarding-only scoped member active people and archived history in their Group', async () => {
		const { port } = provider();
		const member = actor();

		await expect(port.listRoster(member, 'active')).resolves.toMatchObject([
			{ id: 'active-alpha', groupName: 'Alpha', archivedAt: null }
		]);
		await expect(port.listRoster(member, 'all')).resolves.toMatchObject([
			{ id: 'active-alpha' },
			{ id: 'archived-alpha', archivedAt: '2026-01-02' }
		]);
		await expect(port.findGroupIds(member, ['active-alpha', 'archived-alpha', 'bravo', 'other-org'])).resolves.toEqual(
			new Map([
				['active-alpha', 'alpha'],
				['archived-alpha', 'alpha']
			])
		);
	});

	it('denies missing Onboarding access before opening the privileged provider', async () => {
		const { port, getAdminClient } = provider();
		await expect(port.listRoster(actor('none'), 'all')).rejects.toMatchObject({ status: 403 });
		await expect(port.findGroupIds(actor('none'), ['active-alpha'])).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('returns no rows for an empty Group scope without opening the privileged provider', async () => {
		const { port, getAdminClient } = provider();
		const member = actor('view', []);
		await expect(port.listRoster(member, 'all')).resolves.toEqual([]);
		await expect(port.findGroupIds(member, ['active-alpha'])).resolves.toEqual(new Map());
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});
