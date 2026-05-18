import { describe, expect, it, vi } from 'vitest';
import {
	displayOwnerMembership,
	fetchMembershipCountsByOrganization,
	fetchOwnerMembershipsByOrganization,
	fetchPersonnelCountsByOrganization
} from './adminOrganizationMetrics.server';

function makeAdminClient(
	tableRows: Record<string, Array<Record<string, unknown>>>,
	tableErrors: Record<string, unknown> = {}
) {
	const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
	const rpc = vi.fn(async (fn: string, params: { p_org_ids?: string[] }) => {
		calls.push({ table: 'rpc', method: fn, args: [params] });
		if (fn !== 'count_personnel_by_organization') {
			return { data: null, error: new Error(`Unsupported RPC: ${fn}`) };
		}
		if (tableErrors.personnel) {
			return { data: null, error: tableErrors.personnel };
		}
		const orgIds = params.p_org_ids ?? [];
		const rows = (tableRows.personnel ?? []).filter(
			(row) => orgIds.includes(String(row.organization_id)) && row.archived_at === null
		);
		const counts = new Map<string, number>();
		for (const row of rows) {
			const orgId = String(row.organization_id);
			counts.set(orgId, (counts.get(orgId) ?? 0) + 1);
		}
		return {
			data: [...counts.entries()].map(([organization_id, personnel_count]) => ({ organization_id, personnel_count })),
			error: null
		};
	});
	const from = vi.fn((table: string) => ({
		select: vi.fn((columns: string) => {
			calls.push({ table, method: 'select', args: [columns] });
			const filters: Array<(row: Record<string, unknown>) => boolean> = [];
			const execute = async () => {
				if (tableErrors[table]) {
					return { data: null, error: tableErrors[table] };
				}
				const rows = (tableRows[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
				return { data: rows, error: null };
			};
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
					const { data, error } = await execute();
					if (error) return { data: null, error };
					const rows = data ?? [];
					return { data: rows.slice(fromIndex, toIndex + 1), error: null };
				})
			};
			return query;
		})
	}));
	return { client: { from, rpc }, calls };
}

describe('admin organization metrics batching', () => {
	it('fetches personnel counts for multiple organizations with one batched count RPC', async () => {
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
		expect(client.from).not.toHaveBeenCalled();
		expect(client.rpc).toHaveBeenCalledWith('count_personnel_by_organization', { p_org_ids: ['org-1', 'org-2'] });
		expect(calls).toEqual(
			expect.arrayContaining([
				{
					table: 'rpc',
					method: 'count_personnel_by_organization',
					args: [{ p_org_ids: ['org-1', 'org-2'] }]
				}
			])
		);
		expect(calls.some((call) => call.table === 'personnel' && call.method === 'range')).toBe(false);
	});

	it('fetches membership counts and owner memberships in batched organization queries', async () => {
		const { client, calls } = makeAdminClient({
			organization_memberships: [
				{ organization_id: 'org-1', user_id: 'owner-1', email: 'owner-1@example.mil', role: 'owner' },
				{ organization_id: 'org-1', user_id: 'member-1', role: 'member' },
				{ organization_id: 'org-2', user_id: 'owner-2', email: 'owner-2@example.mil', role: 'owner' },
				{ organization_id: 'org-3', user_id: 'owner-3a', role: 'owner' },
				{ organization_id: 'org-3', user_id: 'owner-3b', role: 'owner' },
				{ organization_id: 'org-4', user_id: 'owner-4', email: null, role: 'owner' }
			]
		});

		const orgIds = ['org-1', 'org-2', 'org-3', 'org-4', 'org-5'];
		const memberCounts = await fetchMembershipCountsByOrganization(client, orgIds);
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const ownerMemberships = await fetchOwnerMembershipsByOrganization(client, orgIds);

		expect(memberCounts.get('org-1')).toBe(2);
		expect(memberCounts.get('org-2')).toBe(1);
		expect(ownerMemberships.get('org-1')).toMatchObject({
			kind: 'single',
			membership: { user_id: 'owner-1', email: 'owner-1@example.mil' }
		});
		expect(ownerMemberships.get('org-4')).toMatchObject({
			kind: 'single',
			membership: { user_id: 'owner-4', email: null }
		});
		expect(ownerMemberships.get('org-3')).toEqual({ kind: 'multiple', count: 2 });
		expect(ownerMemberships.get('org-5')).toEqual({ kind: 'none' });
		expect(displayOwnerMembership(ownerMemberships.get('org-1'))).toBe('owner-1@example.mil');
		expect(displayOwnerMembership(ownerMemberships.get('org-4'))).toBe('');
		expect(displayOwnerMembership(ownerMemberships.get('org-3'))).toBe('Multiple owners');
		expect(displayOwnerMembership(ownerMemberships.get('org-5'))).toBe('No owner');
		expect(consoleWarn).toHaveBeenCalledWith('[admin] Organization has unexpected owner membership count:', 'org-3', 2);
		expect(consoleWarn).toHaveBeenCalledWith('[admin] Organization has unexpected owner membership count:', 'org-5', 0);
		consoleWarn.mockRestore();
		expect(client.from).toHaveBeenCalledTimes(2);
		expect(calls).toEqual(
			expect.arrayContaining([
				{
					table: 'organization_memberships',
					method: 'in',
					args: ['organization_id', orgIds]
				},
				{ table: 'organization_memberships', method: 'eq', args: ['role', 'owner'] }
			])
		);
	});

	it('counts large personnel sets without paging every matching row', async () => {
		const personnel = Array.from({ length: 1002 }, () => ({ organization_id: 'org-1', archived_at: null }));
		const { client, calls } = makeAdminClient({ personnel });

		const counts = await fetchPersonnelCountsByOrganization(client, ['org-1']);

		expect(counts.get('org-1')).toBe(1002);
		expect(calls).toContainEqual({
			table: 'rpc',
			method: 'count_personnel_by_organization',
			args: [{ p_org_ids: ['org-1'] }]
		});
		expect(calls.some((call) => call.table === 'personnel' && call.method === 'range')).toBe(false);
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
