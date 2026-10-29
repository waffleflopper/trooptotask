import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOrganizationMemberEmailsReader } from './memberEmails.server';
import { createShiftingPostgrestClient, pagedIds } from '$lib/storage/test-support/shiftingPostgrest.server';

type Row = Record<string, unknown>;
const ORG = 'org-a';

function provider(rows: Row[]) {
	const state = {
		failFrom: null as number | null,
		response: null as { data: unknown } | null,
		requests: [] as Request[]
	};
	const client = createClient('http://labels.invalid', 'supplied-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				state.requests.push(request);
				if (state.requests.length > 8) throw new Error('Label request budget exceeded');
				const url = new URL(request.url);
				if (
					url.origin !== 'http://labels.invalid' ||
					url.pathname !== '/rest/v1/organization_memberships' ||
					request.method !== 'GET'
				)
					throw new Error('Unexpected label provider operation');
				if (
					request.headers.get('authorization') !== 'Bearer supplied-request-key' ||
					request.headers.get('apikey') !== 'supplied-request-key'
				)
					throw new Error('Label read replaced supplied request authority');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.failFrom !== null && offset >= state.failFrom)
					return Response.json({ code: '42501', message: 'Label rows unavailable' }, { status: 403 });
				if (state.response) return Response.json(state.response.data);
				let visible = rows;
				for (const [column, filter] of url.searchParams) {
					if (filter.startsWith('eq.')) visible = visible.filter((row) => String(row[column]) === filter.slice(3));
					else if (filter.startsWith('in.(') && filter.endsWith(')')) {
						const values = filter.slice(4, -1).split(',');
						visible = visible.filter((row) => values.includes(String(row[column])));
					} else if (!['select', 'order', 'offset', 'limit'].includes(column))
						throw new Error('Unexpected label predicate');
				}
				const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000);
				const columns = url.searchParams.get('select');
				return Response.json(
					visible
						.slice(offset, offset + limit)
						.map((row) =>
							!columns || columns === '*'
								? row
								: Object.fromEntries(columns.split(',').map((column) => [column.trim(), row[column.trim()]]))
						)
				);
			}
		}
	});
	return { client, state };
}

describe('Organization current member emails with supplied Supabase authority', () => {
	it('returns only referenced Organization exact nonempty string emails without a name or ID fallback', async () => {
		const { client, state } = provider([
			{ user_id: 'referenced', organization_id: ORG, email: '  Owner@Example.COM  ', name: 'Ignored Name' },
			{ user_id: 'empty', organization_id: ORG, email: '', name: 'No Name Fallback' },
			{ user_id: 'null-email', organization_id: ORG, email: null },
			{ user_id: 'whitespace', organization_id: ORG, email: '  ' },
			{ user_id: 'number-email', organization_id: ORG, email: 17 },
			{ user_id: 'unrequested', organization_id: ORG, email: 'unrequested@example.test' },
			{ user_id: 'referenced', organization_id: 'org-b', email: 'foreign@example.test' },
			{ user_id: 'foreign-only', organization_id: 'org-b', email: 'foreign-only@example.test' }
		]);
		expect(
			await createSupabaseOrganizationMemberEmailsReader(
				client,
				ORG
			)(['referenced', 'empty', 'null-email', 'whitespace', 'number-email', 'foreign-only', 'missing'])
		).toEqual(
			new Map([
				['referenced', '  Owner@Example.COM  '],
				['whitespace', '  ']
			])
		);
		expect(
			new Set((new URL(state.requests[0].url).searchParams.get('select') ?? '').split(',').map((field) => field.trim()))
		).toEqual(new Set(['user_id', 'email']));
		expect(await createSupabaseOrganizationMemberEmailsReader(client, 'org-b')(['referenced'])).toEqual(
			new Map([['referenced', 'foreign@example.test']])
		);
	});

	it('omits malformed provider identities and emails', async () => {
		const { client, state } = provider([]);
		state.response = {
			data: [
				{ user_id: null, email: 'no-identity@example.test' },
				{ user_id: 17, email: 'number-identity@example.test' },
				{ user_id: 'wrong-email', email: { value: 'object@example.test' } },
				{ user_id: 'accepted', email: '  Exact@Example.TEST  ' }
			]
		};
		expect(await createSupabaseOrganizationMemberEmailsReader(client, ORG)(['accepted', 'wrong-email'])).toEqual(
			new Map([['accepted', '  Exact@Example.TEST  ']])
		);
	});

	it('does not access persistence when no IDs are referenced', async () => {
		const { client, state } = provider([]);
		state.failFrom = 0;
		expect(await createSupabaseOrganizationMemberEmailsReader(client, ORG)([])).toEqual(new Map());
		expect(state.requests).toHaveLength(0);
	});

	it('keeps empty and error-free null provider results empty', async () => {
		const { client, state } = provider([]);
		const read = createSupabaseOrganizationMemberEmailsReader(client, ORG);
		expect(await read(['missing'])).toEqual(new Map());
		state.response = { data: null };
		expect(await read(['missing'])).toEqual(new Map());
	});

	it.each([{ unexpected: 'envelope' }, [null]])('rejects a malformed successful provider response %#', async (data) => {
		const { client, state } = provider([]);
		state.response = { data };
		await expect(createSupabaseOrganizationMemberEmailsReader(client, ORG)(['referenced'])).rejects.toThrow();
	});

	it('completes 1001 referenced rows and retains the last-page label', async () => {
		const ids = Array.from({ length: 1001 }, (_, index) => `referenced-${index}`);
		const rows: Row[] = ids.map((id) => ({ user_id: id, organization_id: ORG, email: 'owner@example.test' }));
		rows[1000] = { user_id: ids[1000], organization_id: ORG, email: '  Historic@Example.TEST  ' };
		const { client } = provider(rows);
		const expected = new Map(ids.map((id) => [id, 'owner@example.test']));
		expected.set('referenced-1000', '  Historic@Example.TEST  ');
		expect(await createSupabaseOrganizationMemberEmailsReader(client, ORG)(ids)).toEqual(expected);
	});

	it.each([0, 1000])('rejects a provider failure at offset %i without returning a partial map', async (failFrom) => {
		const ids = Array.from({ length: 1001 }, (_, index) => `referenced-${index}`);
		const { client, state } = provider(
			ids.map((id) => ({ user_id: id, organization_id: ORG, email: 'owner@example.test' }))
		);
		state.failFrom = failFrom;
		await expect(createSupabaseOrganizationMemberEmailsReader(client, ORG)(ids)).rejects.toThrow(
			'Label rows unavailable'
		);
	});

	it('returns every referenced email when physical order shifts between pages', async () => {
		const userIds = pagedIds(1001, 'user');
		const client = createShiftingPostgrestClient({
			organization_memberships: userIds.map((userId, index) => ({
				id: `membership-${String(1000 - index).padStart(5, '0')}`,
				organization_id: ORG,
				user_id: userId,
				email: `${userId}@example.test`
			}))
		});
		expect(await createSupabaseOrganizationMemberEmailsReader(client, ORG)(userIds)).toEqual(
			new Map(userIds.map((userId) => [userId, `${userId}@example.test`]))
		);
	});
});
