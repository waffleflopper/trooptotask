import { createClient } from '@supabase/supabase-js';

type PersonnelTable = 'personnel' | 'groups' | 'user_pinned_groups';
type Row = Record<string, unknown>;
type ProviderRequest = { table: PersonnelTable; method: string; offset: number; url: URL; body: unknown };

export function personnelProvider(initial: Partial<Record<PersonnelTable, Row[]>> = {}) {
	const rows: Record<PersonnelTable, Row[]> = {
		personnel: [],
		groups: [],
		user_pinned_groups: [],
		...structuredClone(initial)
	};
	const requests: ProviderRequest[] = [];
	const state = {
		rows,
		requests,
		nullData: false,
		nullCount: false,
		afterWriteFailure: false,
		unstablePages: false,
		failure: null as
			| null
			| ((
					request: ProviderRequest
			  ) => { code: string; message: string; status: number; details?: string | null } | null)
	};
	let nextId = 1;
	const client = createClient('http://personnel.invalid', 'synthetic-personnel-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.origin !== 'http://personnel.invalid') throw new Error('Unexpected Personnel provider origin');
				if (
					request.headers.get('authorization') !== 'Bearer synthetic-personnel-request-key' ||
					request.headers.get('apikey') !== 'synthetic-personnel-request-key'
				)
					throw new Error('Personnel must retain ordinary request credentials');
				const table = url.pathname.replace('/rest/v1/', '') as PersonnelTable;
				if (!Object.hasOwn(rows, table)) throw new Error('Unexpected Personnel provider table');
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
				if (failure)
					return Response.json(
						{ code: failure.code, message: failure.message, details: failure.details },
						{ status: failure.status }
					);
				if (state.nullData) return Response.json(null);
				let selected = (state.unstablePages && operation.offset > 0 ? rows[table].toReversed() : rows[table]).filter(
					(row) => {
						for (const [column, filter] of url.searchParams) {
							if (['select', 'order', 'offset', 'limit', 'columns'].includes(column)) continue;
							if (column === 'or') {
								const alternatives = filter.slice(1, -1).split(',');
								const holds = alternatives.some((alternative) => {
									const [name, ...predicate] = alternative.split('.');
									if (predicate.join('.') === 'not.is.null') return row[name] != null;
									throw new Error('Unexpected Personnel predicate');
								});
								if (!holds) return false;
							} else if (filter.startsWith('eq.')) {
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
							} else if (filter === 'is.null') {
								if (row[column] != null) return false;
							} else if (filter === 'not.is.null') {
								if (row[column] == null) return false;
							} else if (filter.startsWith('ilike.')) {
								if (!String(row[column]).toLowerCase().startsWith(filter.slice(6, -1).toLowerCase())) return false;
							} else if (filter.startsWith('gte.')) {
								if (String(row[column]) < filter.slice(4)) return false;
							} else if (filter.startsWith('lte.')) {
								if (String(row[column]) > filter.slice(4)) return false;
							} else throw new Error('Unexpected Personnel predicate');
						}
						return true;
					}
				);
				if (request.method === 'POST') {
					const inputs: Row[] = Array.isArray(body) ? body : [body];
					selected = inputs.map((row) => ({
						...row,
						id: `saved-${nextId++}`,
						created_at: '2026-10-06T12:00:00.123456Z'
					}));
					rows[table].push(...selected);
				} else if (request.method === 'PATCH') {
					for (const row of selected) Object.assign(row, body);
				} else if (request.method === 'DELETE') {
					rows[table] = rows[table].filter((row) => !selected.includes(row));
				} else if (request.method !== 'GET' && request.method !== 'HEAD')
					throw new Error('Unexpected Personnel provider method');
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
				const total = selected.length;
				if (request.method === 'HEAD')
					return new Response(null, { headers: state.nullCount ? {} : { 'content-range': `*/${selected.length}` } });
				if (state.afterWriteFailure && ['POST', 'PATCH'].includes(request.method))
					return Response.json({ message: 'Connection lost after write' }, { status: 503 });
				if (request.method === 'GET')
					selected = selected.slice(
						operation.offset,
						operation.offset + Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000)
					);
				const projection = url.searchParams.get('select');
				const result = selected.map((original) => {
					const row = projection?.includes('groups!')
						? {
								...original,
								groups:
									rows.groups.find(
										(group) => group.id === original.group_id && group.organization_id === original.organization_id
									) ?? null
							}
						: original;
					return !projection || projection.startsWith('*')
						? row
						: Object.fromEntries(projection.split(',').map((column) => [column.trim(), row[column.trim()]]));
				});
				if (request.headers.get('accept')?.includes('application/vnd.pgrst.object+json')) {
					if (result.length !== 1)
						return Response.json({ code: 'PGRST116', message: 'Expected one row' }, { status: 406 });
					return Response.json(result[0]);
				}
				if (request.method !== 'GET' && !request.headers.get('prefer')?.includes('return=representation'))
					return new Response(null, { status: 204 });
				return Response.json(result, {
					headers:
						request.headers.get('prefer')?.includes('count=exact') && !state.nullCount
							? { 'content-range': `*/${total}` }
							: {}
				});
			}
		}
	});
	return { client, state };
}
