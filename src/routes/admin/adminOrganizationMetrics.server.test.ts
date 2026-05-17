import { describe, expect, it, vi } from 'vitest';
import {
	fetchMembershipCountsByOrganization,
	fetchOwnerMembershipsByOrganization,
	fetchPersonnelCountsByOrganization
} from './adminOrganizationMetrics.server';

function makeAdminClient(
	tableRows: Record<string, Array<Record<string, unknown>>>,
	tableErrors: Record<string, unknown> = {}
) {
	const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
	const from = vi.fn((table: string) => ({
		select: vi.fn((_columns: string) => {
			const filters: Array<(row: Record<string, unknown>) => boolean> = [];
			const query = {
				in: vi.fn((column: string, values: string[]) => {
					calls.push({ table, method: 'in', args: [column, values] });
					filters.push((row) => values.includes(String(row[column])));
					return query;
				}),
				is: vi.fn((column: string, value: unknown) => {
					calls.push({ table, method: 'is', args: [column, value] });
					filters.push((row) => row[column] === value);
					return query;
				}),
				eq: vi.fn((column: string, value: unknown) => {
					calls.push({ table, method: 'eq', args: [column, value] });
					filters.push((row) => row[column] === value);
					return query;
				}),
				range: vi.fn(async (fromIndex: number, toIndex: number) => {
					calls.push({ table, method: 'range', args: [fromIndex, toIndex] });
					if (tableErrors[table]) {
						return { data: null, error: tableErrors[table] };
					}
					const rows = (tableRows[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
					return { data: rows.slice(fromIndex, toIndex + 1), error: null };
				})
			};
			return query;
		})
	}));
	return { client: { from }, calls };
}

describe('admin organization metrics batching', () => {
	it('fetches personnel counts for multiple organizations with one batched table query', async () => {
		const { client, calls } = makeAdminClient({
			personnel: [
				{ organization_id: 'org-1', archived_at: null },
				{ organization_id: 'org-1', archived_at: null },
				{ organization_id: 'org-2', archived_at: null },
				{ organization_id: 'org-2', archived_at: '2026-01-01T00:00:00.000Z' }
			]
		});

		const counts = await fetchPersonnelCountsByOrganization(client, ['org-1', 'org-2']);

		expect(counts.get('org-1')).toBe(2);
		expect(counts.get('org-2')).toBe(1);
		expect(client.from).toHaveBeenCalledTimes(1);
		expect(calls).toEqual(
			expect.arrayContaining([
				{ table: 'personnel', method: 'in', args: ['organization_id', ['org-1', 'org-2']] },
				{ table: 'personnel', method: 'is', args: ['archived_at', null] }
			])
		);
	});

	it('fetches membership counts and owner memberships in batched organization queries', async () => {
		const { client, calls } = makeAdminClient({
			organization_memberships: [
				{ organization_id: 'org-1', user_id: 'owner-1', role: 'owner' },
				{ organization_id: 'org-1', user_id: 'member-1', role: 'member' },
				{ organization_id: 'org-2', user_id: 'owner-2', role: 'owner' },
				{ organization_id: 'org-3', user_id: 'owner-3a', role: 'owner' },
				{ organization_id: 'org-3', user_id: 'owner-3b', role: 'owner' }
			]
		});

		const memberCounts = await fetchMembershipCountsByOrganization(client, ['org-1', 'org-2', 'org-3']);
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const ownerMemberships = await fetchOwnerMembershipsByOrganization(client, ['org-1', 'org-2', 'org-3']);

		expect(memberCounts.get('org-1')).toBe(2);
		expect(memberCounts.get('org-2')).toBe(1);
		expect(ownerMemberships.get('org-1')).toMatchObject({ user_id: 'owner-1' });
		expect(ownerMemberships.has('org-3')).toBe(false);
		expect(consoleWarn).toHaveBeenCalledWith('[admin] Organization has unexpected owner membership count:', 'org-3', 2);
		consoleWarn.mockRestore();
		expect(client.from).toHaveBeenCalledTimes(2);
		expect(calls).toEqual(
			expect.arrayContaining([
				{ table: 'organization_memberships', method: 'in', args: ['organization_id', ['org-1', 'org-2', 'org-3']] },
				{ table: 'organization_memberships', method: 'eq', args: ['role', 'owner'] }
			])
		);
	});

	it('counts all paginated personnel rows across Supabase pages', async () => {
		const personnel = Array.from({ length: 1002 }, () => ({ organization_id: 'org-1', archived_at: null }));
		const { client, calls } = makeAdminClient({ personnel });

		const counts = await fetchPersonnelCountsByOrganization(client, ['org-1']);

		expect(counts.get('org-1')).toBe(1002);
		expect(
			calls.filter((call) => call.table === 'personnel' && call.method === 'range').map((call) => call.args)
		).toEqual([
			[0, 999],
			[1000, 1999]
		]);
	});

	it('returns an empty map when a batched metrics query fails', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { client } = makeAdminClient({}, { personnel: new Error('database unavailable') });

		const counts = await fetchPersonnelCountsByOrganization(client, ['org-1']);

		expect(counts.size).toBe(0);
		expect(consoleError).toHaveBeenCalledWith('[admin] Failed to batch personnel counts:', expect.any(Error));
		consoleError.mockRestore();
	});

	it('returns empty maps when membership metrics queries fail', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { client } = makeAdminClient({}, { organization_memberships: new Error('database unavailable') });

		const memberCounts = await fetchMembershipCountsByOrganization(client, ['org-1']);
		const ownerMemberships = await fetchOwnerMembershipsByOrganization(client, ['org-1']);

		expect(memberCounts.size).toBe(0);
		expect(ownerMemberships.size).toBe(0);
		expect(consoleError).toHaveBeenCalledWith('[admin] Failed to batch membership counts:', expect.any(Error));
		expect(consoleError).toHaveBeenCalledWith('[admin] Failed to batch owner memberships:', expect.any(Error));
		consoleError.mockRestore();
	});
});
