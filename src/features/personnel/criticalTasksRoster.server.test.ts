import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelCriticalTasksRosterPort } from './criticalTasksRoster.server';

function actor(criticalTasks: 'none' | 'view' | 'operate' = 'view', groupIds: string[] | null = ['group-1']) {
	return createTestAuthContext({
		orgId: 'org-1',
		role: 'member',
		isPrivileged: false,
		scopeSet: groupIds === null ? { kind: 'organization' } : { kind: 'groups', groupIds },
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'none',
			criticalTasks,
			onboarding: 'none',
			ratingScheme: 'none'
		}
	});
}

function createPersonnelClient(rows: Array<Record<string, unknown>>) {
	let filtered = rows;
	const query = {
		select: () => query,
		eq: (column: string, value: unknown) => {
			filtered = filtered.filter((row) => row[column] === value);
			return query;
		},
		is: (column: string, value: unknown) => {
			filtered = filtered.filter((row) => row[column] === value);
			return query;
		},
		in: (column: string, values: unknown[]) => {
			filtered = filtered.filter((row) => values.includes(row[column]));
			return query;
		},
		order: () => query,
		range: (from: number, to: number) => Promise.resolve({ data: filtered.slice(from, to + 1), error: null })
	};
	return vi.fn(
		() =>
			({
				from: () => {
					filtered = rows;
					return query;
				}
			}) as unknown as SupabaseClient
	);
}

describe('Personnel Critical Tasks roster', () => {
	const rows = [
		{
			id: 'active-alpha',
			organization_id: 'org-1',
			group_id: 'group-1',
			archived_at: null,
			rank: 'SGT',
			first_name: 'Ann',
			last_name: 'Alpha'
		},
		{
			id: 'archived-alpha',
			organization_id: 'org-1',
			group_id: 'group-1',
			archived_at: '2026-01-01',
			rank: 'SPC',
			first_name: 'Amy',
			last_name: 'Alpha'
		},
		{
			id: 'active-bravo',
			organization_id: 'org-1',
			group_id: 'group-2',
			archived_at: null,
			rank: 'SPC',
			first_name: 'Ben',
			last_name: 'Bravo'
		},
		{
			id: 'foreign',
			organization_id: 'org-2',
			group_id: 'group-1',
			archived_at: null,
			rank: 'SPC',
			first_name: 'Finn',
			last_name: 'Foreign'
		},
		{
			id: 'unassigned',
			organization_id: 'org-1',
			group_id: null,
			archived_at: null,
			rank: 'SPC',
			first_name: 'Uma',
			last_name: 'Unassigned'
		}
	];

	it('returns only active same-Organization and same-Group readiness people, while history keeps archived people', async () => {
		const getAdminClient = createPersonnelClient(rows);
		const port = createSupabasePersonnelCriticalTasksRosterPort(getAdminClient);

		await expect(port.listActiveForReadiness(actor())).resolves.toEqual([
			expect.objectContaining({ id: 'active-alpha', groupId: 'group-1' })
		]);
		expect(getAdminClient).toHaveBeenCalledTimes(1);

		const historyClient = createPersonnelClient(rows);
		const historyPort = createSupabasePersonnelCriticalTasksRosterPort(historyClient);
		await expect(historyPort.findForHistory(actor(), 'archived-alpha')).resolves.toMatchObject({
			id: 'archived-alpha',
			archivedAt: '2026-01-01'
		});
		await expect(historyPort.findForHistory(actor(), 'active-bravo')).resolves.toBeNull();
		await expect(historyPort.findForHistory(actor(), 'foreign')).resolves.toBeNull();
	});

	it('denies missing Critical Tasks capability before opening the admin provider', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabasePersonnelCriticalTasksRosterPort(getAdminClient as () => SupabaseClient);
		await expect(port.listActiveForReadiness(actor('none'))).rejects.toMatchObject({ status: 403 });
		await expect(port.findForHistory(actor('none'), 'active-alpha')).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('returns no Personnel from an empty Group scope before opening the admin provider', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabasePersonnelCriticalTasksRosterPort(getAdminClient as () => SupabaseClient);
		await expect(port.listActiveForReadiness(actor('view', []))).resolves.toEqual([]);
		await expect(port.findForHistory(actor('view', []), 'active-alpha')).resolves.toBeNull();
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('returns all-status same-Organization batch candidates under Critical Tasks operate and exact Group scope', async () => {
		const getAdminClient = createPersonnelClient(rows);
		const port = createSupabasePersonnelCriticalTasksRosterPort(getAdminClient);

		await expect(port.listForBatchImport(actor('operate'))).resolves.toEqual([
			expect.objectContaining({ id: 'active-alpha', archivedAt: null }),
			expect.objectContaining({ id: 'archived-alpha', archivedAt: '2026-01-01' })
		]);
		await expect(port.listForBatchImport(actor('operate', null))).resolves.toEqual([
			expect.objectContaining({ id: 'active-alpha' }),
			expect.objectContaining({ id: 'archived-alpha' }),
			expect.objectContaining({ id: 'active-bravo' }),
			expect.objectContaining({ id: 'unassigned' })
		]);
	});

	it('denies batch roster access without record-completion permission before opening the admin provider', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabasePersonnelCriticalTasksRosterPort(getAdminClient as () => SupabaseClient);
		await expect(port.listForBatchImport(actor('view'))).rejects.toMatchObject({ status: 403 });
		await expect(port.listForBatchImport(actor('none'))).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
		await expect(port.listForBatchImport(actor('operate', []))).resolves.toEqual([]);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});
