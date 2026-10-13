import { describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseSignInRosterPersonnelLookupPort } from './signInRosterPersonnelLookup.server';

function createPersonnelRestFake(rows: Record<string, unknown>[]) {
	const inList = (url: URL, column: string) =>
		url.searchParams
			.get(column)
			?.match(/^in\.\((.*)\)$/)?.[1]
			.split(',')
			.map((value) => value.replace(/^"|"$/g, ''));
	return createClient('http://127.0.0.1:9', 'synthetic-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input) => {
				const url = new URL(String(input));
				const orgId = url.searchParams.get('organization_id')?.replace(/^eq\./, '');
				const ids = inList(url, 'id');
				const groupIds = inList(url, 'group_id');
				return Response.json(
					rows.filter(
						(row) =>
							row.organization_id === orgId &&
							(!ids || ids.includes(row.id as string)) &&
							(!groupIds || groupIds.includes(row.group_id as string))
					)
				);
			}
		}
	});
}

describe('SupabaseSignInRosterPersonnelLookupPort', () => {
	it('finds out-of-Group People no more than unknown IDs for a Group-scoped actor', async () => {
		const supabase = createPersonnelRestFake([
			{
				id: 'p-alpha',
				organization_id: 'org-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				group_id: 'group-alpha',
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-bravo',
				organization_id: 'org-1',
				rank: 'SSG',
				last_name: 'Jones',
				first_name: 'Avery',
				group_id: 'group-bravo',
				groups: { name: 'Bravo' }
			}
		]);
		const port = createSupabaseSignInRosterPersonnelLookupPort(() => supabase);

		await expect(
			port.findPersonnelForRosterSnapshot('org-1', { kind: 'groups', groupIds: ['group-alpha'] }, [
				'p-alpha',
				'p-bravo',
				'p-missing'
			])
		).resolves.toEqual([
			{ id: 'p-alpha', rank: 'SGT', lastName: 'Smith', firstName: 'Jane', groupId: 'group-alpha', groupName: 'Alpha' }
		]);
	});

	it('maps names and Groups for an Organization-scoped actor', async () => {
		const supabase = createPersonnelRestFake([
			{
				id: 'person-1',
				organization_id: 'org-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				group_id: 'group-1',
				groups: { name: 'Alpha' }
			},
			{
				id: 'person-2',
				organization_id: 'org-1',
				rank: null,
				last_name: null,
				first_name: null,
				group_id: null,
				groups: null
			},
			{ id: 'person-3', organization_id: 'org-2', rank: 'SPC', last_name: 'Foreign', group_id: null }
		]);
		const port = createSupabaseSignInRosterPersonnelLookupPort(() => supabase);

		await expect(
			port.findPersonnelForRosterSnapshot('org-1', { kind: 'organization' }, ['person-1', 'person-2', 'person-3'])
		).resolves.toEqual([
			{ id: 'person-1', rank: 'SGT', lastName: 'Smith', firstName: 'Jane', groupId: 'group-1', groupName: 'Alpha' },
			{ id: 'person-2', rank: null, lastName: null, firstName: null, groupId: null, groupName: null }
		]);
	});

	it('does not create the admin client for empty lookups', async () => {
		const getAdminClient = vi.fn();
		const port = createSupabaseSignInRosterPersonnelLookupPort(getAdminClient as () => SupabaseClient);

		await expect(port.findPersonnelForRosterSnapshot('org-1', { kind: 'organization' }, [])).resolves.toEqual([]);
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('throws query errors', async () => {
		const supabase = createClient('http://127.0.0.1:9', 'synthetic-anon-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async () => Response.json({ message: 'permission denied for table personnel' }, { status: 403 })
			}
		});
		const port = createSupabaseSignInRosterPersonnelLookupPort(() => supabase);

		await expect(port.findPersonnelForRosterSnapshot('org-1', { kind: 'organization' }, ['person-1'])).rejects.toThrow(
			'permission denied for table personnel'
		);
	});
});
