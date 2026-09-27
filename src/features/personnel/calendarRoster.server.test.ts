import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelCalendarRosterPort } from './calendarRoster.server';

function provider(result: { data: unknown[] | null; error: { message: string } | null }) {
	const query = {
		select: vi.fn(),
		eq: vi.fn(),
		is: vi.fn(),
		in: vi.fn(),
		order: vi.fn(),
		range: vi.fn(),
		then: vi.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject))
	};
	for (const method of ['select', 'eq', 'is', 'in', 'order', 'range'] as const) {
		query[method].mockReturnValue(query);
	}
	const client = { from: vi.fn().mockReturnValue(query) };
	const getAdminClient = vi.fn(() => client as unknown as SupabaseClient);
	return { query, client, getAdminClient, roster: createSupabasePersonnelCalendarRosterPort(getAdminClient) };
}

function calendarActor(scopeSet: ReturnType<typeof createTestAuthContext>['scopeSet'] = { kind: 'organization' }) {
	return createTestAuthContext({
		orgId: 'org-1',
		role: 'member',
		isPrivileged: false,
		scopeSet,
		capabilityMap: {
			calendar: 'view',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		}
	});
}

describe('Personnel Calendar roster provider', () => {
	it('returns the active roster for Calendar-only access within the actor Organization and Group', async () => {
		const { roster, query, client } = provider({
			data: [
				{
					id: 'p-1',
					slug: 'p-1',
					rank: 'SGT',
					last_name: 'Smith',
					first_name: 'Jane',
					clinic_role: 'Medic',
					group_id: 'g-1',
					groups: { name: 'Alpha' },
					archived_at: null
				}
			],
			error: null
		});
		const people = await roster.listActive(calendarActor({ kind: 'groups', groupIds: ['g-1'] }));

		expect(client.from).toHaveBeenCalledWith('personnel');
		expect(query.eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(query.is).toHaveBeenCalledWith('archived_at', null);
		expect(query.in).toHaveBeenCalledWith('group_id', ['g-1']);
		expect(people.map((person) => [person.id, person.groupName])).toEqual([['p-1', 'Alpha']]);
	});

	it('includes archived assignee IDs and limits targeted Group lookups to the actor scope', async () => {
		const { roster, query } = provider({
			data: [{ id: 'p-old', group_id: 'g-1', archived_at: '2026-01-01' }],
			error: null
		});
		const actor = calendarActor({ kind: 'groups', groupIds: ['g-1'] });

		await expect(roster.listAssigneeIds(actor)).resolves.toEqual(['p-old']);
		await expect(roster.findGroupIds(actor, ['p-old', 'p-outside'])).resolves.toEqual(new Map([['p-old', 'g-1']]));
		expect(query.is).not.toHaveBeenCalled();
		expect(query.in).toHaveBeenCalledWith('group_id', ['g-1']);
		expect(query.in).toHaveBeenCalledWith('id', ['p-old', 'p-outside']);
	});

	it('resolves a supported 500-Person Calendar batch within the provider URL budget', async () => {
		const ids = Array.from({ length: 500 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
		const client = {
			from: () => {
				let selectedIds: string[] = [];
				const query = {
					select: () => query,
					eq: () => query,
					is: () => query,
					in: (column: string, values: string[]) => {
						if (column === 'id') selectedIds = values;
						return query;
					},
					order: () => query,
					range: () => query,
					then: (resolve: (value: unknown) => unknown) =>
						Promise.resolve(
							selectedIds.join(',').length > 7000
								? { data: null, error: { message: 'URI too long' } }
								: { data: selectedIds.map((id) => ({ id, group_id: 'g-1' })), error: null }
						).then(resolve)
				};
				return query;
			}
		};
		const roster = createSupabasePersonnelCalendarRosterPort(() => client as unknown as SupabaseClient);

		const resolved = await roster.findGroupIds(calendarActor(), ids);
		expect(resolved.size).toBe(ids.length);
		expect(ids.every((id) => resolved.get(id) === 'g-1')).toBe(true);
	});

	it('does not open the admin client for an empty Group scope', async () => {
		const { roster, getAdminClient } = provider({ data: [], error: null });
		await expect(roster.listActive(calendarActor({ kind: 'groups', groupIds: [] }))).resolves.toEqual([]);
		await expect(roster.listAssigneeIds(calendarActor({ kind: 'groups', groupIds: [] }))).resolves.toEqual([]);
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('denies a member without Calendar access before opening the admin client', async () => {
		const { roster, getAdminClient } = provider({ data: [], error: null });
		const actor = calendarActor();
		actor.capabilityMap.calendar = 'none';

		await expect(roster.listActive(actor)).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});
