import { createClient } from '@supabase/supabase-js';

const TABLES = [
	'organization_rank_catalog',
	'personnel_extended_info',
	'counseling_records',
	'personnel_documents',
	'personnel_follow_ups',
	'leader_notes',
	'personnel'
] as const;
type PersonnelTable = (typeof TABLES)[number];
function isTable(value: string): value is PersonnelTable {
	return TABLES.some((table) => table === value);
}
type Row = Record<string, unknown>;
type ProviderRequest = { table: PersonnelTable; method: string; offset: number; url: URL; body: unknown };

export function personnelProvider(initial: Partial<Record<PersonnelTable, Row[]>> = {}) {
	const rows: Record<PersonnelTable, Row[]> = {
		organization_rank_catalog: [],
		personnel_extended_info: [],
		counseling_records: [],
		personnel_documents: [],
		personnel_follow_ups: [],
		leader_notes: [],
		personnel: [],
		...structuredClone(initial)
	};
	const requests: ProviderRequest[] = [];
	const state: {
		rows: Record<PersonnelTable, Row[]>;
		requests: ProviderRequest[];
		nullData: boolean;
		countNull: boolean;
		unstablePages: boolean;
		passthrough: boolean;
		failure: null | ((request: ProviderRequest) => { code: string; message: string; status: number } | null);
	} = {
		rows,
		requests,
		nullData: false,
		countNull: false,
		unstablePages: false,
		passthrough: false,
		failure: null
	};
	let nextId = 1;
	const newArtifact = (table: PersonnelTable, input: Row): Row => ({
		archived_at: null,
		...(table === 'personnel_follow_ups' ? { completed_at: null } : {}),
		...input,
		id: input.id ?? `saved-${nextId++}`,
		created_at: input.created_at ?? '2026-10-08T12:00:00.123456Z'
	});
	/** The service-role record commands, bound to the unit and person they are given, as the SQL functions are. */
	const artifactCommand = (url: URL, args: Record<string, unknown>): Response => {
		const name = url.pathname.slice('/rest/v1/rpc/'.length);
		const table = String(args.p_table);
		if (!isTable(table)) throw new Error('Unexpected Personnel provider table');
		const operation = { table, method: 'POST', offset: 0, url, body: args };
		requests.push(operation);
		const failure = state.failure?.(operation);
		if (failure) return Response.json({ code: failure.code, message: failure.message }, { status: failure.status });
		const bound = (row: Row) =>
			row.organization_id === args.p_organization_id &&
			row.personnel_id === args.p_personnel_id &&
			row.id === args.p_id;
		if (name === 'insert_personnel_artifacts') {
			const saved = (args.p_rows as Row[]).map((input) =>
				newArtifact(table, { ...input, organization_id: args.p_organization_id })
			);
			rows[table].push(...saved);
			return Response.json(saved);
		}
		if (name === 'update_personnel_artifact') {
			const row = rows[table].find(bound);
			if (!row) return Response.json({ code: 'P0002', message: 'Personnel artifact not found' }, { status: 404 });
			Object.assign(row, args.p_patch);
			return Response.json(row);
		}
		if (name === 'delete_personnel_artifact') {
			rows[table] = rows[table].filter((row) => !bound(row));
			return new Response(null, { status: 204 });
		}
		throw new Error('Unexpected Personnel provider command');
	};
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
				if (url.pathname.startsWith('/rest/v1/rpc/')) return artifactCommand(url, await request.json());
				const table = url.pathname.replace('/rest/v1/', '');
				if (!isTable(table)) throw new Error('Unexpected Personnel provider table');
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
							if (['select', 'order', 'offset', 'limit', 'columns', 'on_conflict'].includes(column)) continue;
							if (filter.startsWith('eq.')) {
								if (String(row[column]) !== filter.slice(3)) return false;
							} else if (filter.startsWith('neq.')) {
								if (String(row[column]) === filter.slice(4)) return false;
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
							} else if (filter === 'is.null') {
								if (row[column] !== null) return false;
							} else if (filter === 'not.is.null') {
								if (row[column] === null) return false;
							} else if (filter.startsWith('lt.')) {
								if (String(row[column]) >= filter.slice(3)) return false;
							} else if (filter.startsWith('not.in.(')) {
								if (filter.slice(8, -1).split(',').includes(String(row[column]))) return false;
							} else throw new Error('Unexpected Personnel predicate');
						}
						return true;
					}
				);
				if (request.method === 'POST') {
					const inputs: Row[] = Array.isArray(body) ? body : [body];
					const conflictColumns = url.searchParams.get('on_conflict')?.split(',');
					selected = inputs.map((input) => {
						const existing = conflictColumns
							? rows[table].find((row) => conflictColumns.every((key) => row[key] === input[key]))
							: null;
						if (existing) {
							Object.assign(existing, input);
							return existing;
						}
						const row = {
							...(['counseling_records', 'personnel_documents', 'personnel_follow_ups', 'leader_notes'].includes(table)
								? { archived_at: null }
								: {}),
							...(table === 'personnel_follow_ups' ? { completed_at: null } : {}),
							...input,
							id: input.id ?? `saved-${nextId++}`,
							created_at: input.created_at ?? '2026-10-08T12:00:00.123456Z'
						};
						rows[table].push(row);
						return row;
					});
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
				const count = selected.length;
				if (request.method === 'HEAD')
					return new Response(null, { headers: { 'content-range': `*/${state.countNull ? '*' : count}` } });
				if (request.method === 'GET')
					selected = selected.slice(
						operation.offset,
						operation.offset + Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000)
					);
				const projection = url.searchParams.get('select');
				const result = selected.map((row) =>
					state.passthrough || !projection || projection === '*'
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
				return Response.json(result, {
					headers:
						request.headers.get('prefer')?.includes('count=estimated') && !state.countNull
							? { 'content-range': `0-${Math.max(0, result.length - 1)}/${count}` }
							: {}
				});
			}
		}
	});
	return { client, state };
}
