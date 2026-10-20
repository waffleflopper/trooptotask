import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseTrainingTypeNamesReader } from './trainingTypeNames.server';
import { createShiftingPostgrestClient, pagedIds } from '$lib/test-support/shiftingPostgrest';

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
					url.pathname !== '/rest/v1/training_types' ||
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

describe('Training current type names with supplied Supabase authority', () => {
	it('returns referenced Organization labels, retaining null fallback and empty or untrimmed names', async () => {
		const { client, state } = provider([
			{ id: 'referenced', organization_id: ORG, name: 'Combat lifesaver', color: 'excluded' },
			{ id: 'null-name', organization_id: ORG, name: null },
			{ id: 'empty', organization_id: ORG, name: '' },
			{ id: 'whitespace', organization_id: ORG, name: '  Leave  ' },
			{ id: 'unrequested', organization_id: ORG, name: 'Unrequested local type' },
			{ id: 'referenced', organization_id: 'org-b', name: 'Foreign type' },
			{ id: 'foreign-only', organization_id: 'org-b', name: 'Foreign only' }
		]);
		expect(
			await createSupabaseTrainingTypeNamesReader(
				client,
				ORG
			)(['referenced', 'null-name', 'empty', 'whitespace', 'foreign-only', 'missing'])
		).toEqual(
			new Map([
				['referenced', 'Combat lifesaver'],
				['null-name', 'null-name'],
				['empty', ''],
				['whitespace', '  Leave  ']
			])
		);
		expect(
			new Set((new URL(state.requests[0].url).searchParams.get('select') ?? '').split(',').map((field) => field.trim()))
		).toEqual(new Set(['id', 'name']));
		expect(await createSupabaseTrainingTypeNamesReader(client, 'org-b')(['referenced'])).toEqual(
			new Map([['referenced', 'Foreign type']])
		);
	});

	it('does not access persistence when no IDs are referenced', async () => {
		const { client, state } = provider([]);
		state.failFrom = 0;
		expect(await createSupabaseTrainingTypeNamesReader(client, ORG)([])).toEqual(new Map());
		expect(state.requests).toHaveLength(0);
	});

	it('keeps empty and error-free null provider results empty', async () => {
		const { client, state } = provider([]);
		const read = createSupabaseTrainingTypeNamesReader(client, ORG);
		expect(await read(['missing'])).toEqual(new Map());
		state.response = { data: null };
		expect(await read(['missing'])).toEqual(new Map());
	});

	it.each([{ unexpected: 'envelope' }, [null]])('rejects a malformed successful provider response %#', async (data) => {
		const { client, state } = provider([]);
		state.response = { data };
		await expect(createSupabaseTrainingTypeNamesReader(client, ORG)(['referenced'])).rejects.toThrow();
	});

	it('completes 1001 referenced rows and retains the last-page label', async () => {
		const ids = Array.from({ length: 1001 }, (_, index) => `referenced-${index}`);
		const rows: Row[] = ids.map((id) => ({ id: id, organization_id: ORG, name: 'Combat lifesaver' }));
		rows[1000] = { id: ids[1000], organization_id: ORG, name: null };
		const { client } = provider(rows);
		const expected = new Map(ids.map((id) => [id, 'Combat lifesaver']));
		expected.set('referenced-1000', 'referenced-1000');
		expect(await createSupabaseTrainingTypeNamesReader(client, ORG)(ids)).toEqual(expected);
	});

	it.each([0, 1000])('rejects a provider failure at offset %i without returning a partial map', async (failFrom) => {
		const ids = Array.from({ length: 1001 }, (_, index) => `referenced-${index}`);
		const { client, state } = provider(ids.map((id) => ({ id: id, organization_id: ORG, name: 'Combat lifesaver' })));
		state.failFrom = failFrom;
		await expect(createSupabaseTrainingTypeNamesReader(client, ORG)(ids)).rejects.toThrow('Label rows unavailable');
	});

	it('labels every referenced row when physical order shifts between pages', async () => {
		const ids = pagedIds(1001);
		const client = createShiftingPostgrestClient({
			training_types: ids.map((id) => ({ id, organization_id: ORG, name: `Training ${id}` }))
		});
		expect(await createSupabaseTrainingTypeNamesReader(client, ORG)(ids)).toEqual(
			new Map(ids.map((id) => [id, `Training ${id}`]))
		);
	});
});
