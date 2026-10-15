import { createClient } from '@supabase/supabase-js';

type CalendarTable =
	| 'status_types'
	| 'assignment_types'
	| 'special_days'
	| 'availability_entries'
	| 'daily_assignments';
type Row = Record<string, unknown>;
type ProviderRequest = { table: CalendarTable; method: string; offset: number; url: URL; body: unknown };
const COLUMN_DEFAULTS: Partial<Record<CalendarTable, Row>> = {
	assignment_types: { sort_order: 0, show_on_calendar: false }
};

export function calendarProvider(initial: Partial<Record<CalendarTable, Row[]>> = {}) {
	const rows: Record<CalendarTable, Row[]> = {
		status_types: [],
		assignment_types: [],
		special_days: [],
		availability_entries: [],
		daily_assignments: [],
		...structuredClone(initial)
	};
	const requests: ProviderRequest[] = [];
	const state = {
		rows,
		requests,
		nullData: false,
		unstablePages: false,
		failure: null as null | ((request: ProviderRequest) => { code: string; message: string; status: number } | null)
	};
	let nextId = 1;
	const client = createClient('http://calendar.invalid', 'synthetic-calendar-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.origin !== 'http://calendar.invalid') throw new Error('Unexpected Calendar provider origin');
				if (
					request.headers.get('authorization') !== 'Bearer synthetic-calendar-request-key' ||
					request.headers.get('apikey') !== 'synthetic-calendar-request-key'
				)
					throw new Error('Calendar must retain ordinary request credentials');
				const table = url.pathname.replace('/rest/v1/', '') as CalendarTable;
				if (!Object.hasOwn(rows, table)) throw new Error('Unexpected Calendar provider table');
				const body = request.method === 'POST' || request.method === 'PATCH' ? await request.json() : null;
				const operation = {
					table,
					method: request.method,
					offset: Number(url.searchParams.get('offset') ?? 0),
					url,
					body
				};
				requests.push(operation);
				const failure = state.failure?.(operation);
				if (failure) return Response.json({ code: failure.code, message: failure.message }, { status: failure.status });
				if (state.nullData) return Response.json(null);
				let selected = (state.unstablePages && operation.offset > 0 ? rows[table].toReversed() : rows[table]).filter(
					(row) => {
						for (const [column, filter] of url.searchParams) {
							if (['select', 'order', 'offset', 'limit', 'columns'].includes(column)) continue;
							if (filter.startsWith('eq.')) {
								if (String(row[column]) !== filter.slice(3)) return false;
							} else if (filter.startsWith('in.(')) {
								if (
									!filter
										.slice(4, -1)
										.split(',')
										.map((value) => value.replace(/^"|"$/g, ''))
										.includes(String(row[column]))
								)
									return false;
							} else if (filter.startsWith('gte.')) {
								if (String(row[column]) < filter.slice(4)) return false;
							} else if (filter.startsWith('lte.')) {
								if (String(row[column]) > filter.slice(4)) return false;
							} else throw new Error('Unexpected Calendar predicate');
						}
						return true;
					}
				);
				if (request.method === 'POST') {
					const inputs: Row[] = Array.isArray(body) ? body : [body];
					selected = inputs.map((row) => ({
						...COLUMN_DEFAULTS[table],
						...row,
						id: `saved-${nextId++}`,
						created_at: '2026-10-06T12:00:00.123456Z'
					}));
					rows[table].push(...selected);
				} else if (request.method === 'PATCH') {
					for (const row of selected) Object.assign(row, body);
				} else if (request.method === 'DELETE') {
					rows[table] = rows[table].filter((row) => !selected.includes(row));
				} else if (request.method !== 'GET') throw new Error('Unexpected Calendar provider method');
				const order = url.searchParams.get('order');
				if (order) {
					const fields = order.split(',').map((field) => field.split('.'));
					selected = selected.toSorted((a, b) => {
						for (const [column, direction] of fields) {
							const left = a[column];
							const right = b[column];
							const value =
								typeof left === 'number' && typeof right === 'number'
									? left - right
									: String(left).localeCompare(String(right));
							if (value) return value * (direction === 'desc' ? -1 : 1);
						}
						return 0;
					});
				}
				if (request.method === 'GET')
					selected = selected.slice(
						operation.offset,
						operation.offset + Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000)
					);
				const projection = url.searchParams.get('select');
				const result = selected.map((row) =>
					!projection || projection === '*'
						? row
						: Object.fromEntries(projection.split(',').map((column) => [column.trim(), row[column.trim()]]))
				);
				if (request.headers.get('accept')?.includes('application/vnd.pgrst.object+json')) {
					if (result.length !== 1)
						return Response.json({ code: 'PGRST116', message: 'Expected one row' }, { status: 406 });
					return Response.json(result[0]);
				}
				if (request.method !== 'GET' && !request.headers.get('prefer')?.includes('return=representation'))
					return new Response(null, { status: 204 });
				return Response.json(result);
			}
		}
	});
	return { client, state };
}
