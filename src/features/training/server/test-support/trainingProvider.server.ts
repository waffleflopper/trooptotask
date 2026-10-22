import { createClient } from '@supabase/supabase-js';

type TrainingTable = 'training_types' | 'training_views' | 'personnel_trainings' | 'personnel_training_history';
type Row = Record<string, unknown>;
type ProviderRequest = { table: TrainingTable; method: string; offset: number; url: URL; body: unknown };

export function trainingProvider(initial: Partial<Record<TrainingTable, Row[]>> = {}) {
	const rows: Record<TrainingTable, Row[]> = {
		training_types: [],
		training_views: [],
		personnel_trainings: [],
		personnel_training_history: [],
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
	const client = createClient('http://training.invalid', 'synthetic-training-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.origin !== 'http://training.invalid') throw new Error('Unexpected Training provider origin');
				if (
					request.headers.get('authorization') !== 'Bearer synthetic-training-request-key' ||
					request.headers.get('apikey') !== 'synthetic-training-request-key'
				)
					throw new Error('Training must retain ordinary request credentials');
				const table = url.pathname.replace('/rest/v1/', '') as TrainingTable;
				if (!Object.hasOwn(rows, table)) throw new Error('Unexpected Training provider table');
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
							} else throw new Error('Unexpected Training predicate');
						}
						return true;
					}
				);
				if (request.method === 'POST') {
					const inputs: Row[] = Array.isArray(body) ? body : [body];
					selected = inputs.map((input) => {
						const existing = url.searchParams.has('on_conflict')
							? rows[table].find((row) =>
									['organization_id', 'personnel_id', 'training_type_id'].every((key) => row[key] === input[key])
								)
							: null;
						if (existing) {
							Object.assign(existing, input);
							return existing;
						}
						const row = {
							...input,
							id: `saved-${nextId++}`,
							created_at: '2026-10-07T12:00:00.123456Z',
							...(table === 'training_views'
								? { created_by: 'actor-a', updated_at: '2026-10-07T12:00:00.123456Z' }
								: {}),
							...(table === 'personnel_trainings'
								? { certificate_url: null, updated_at: '2026-10-07T12:00:00.123456Z' }
								: {})
						};
						rows[table].push(row);
						return row;
					});
				} else if (request.method === 'PATCH') {
					for (const row of selected) Object.assign(row, body);
				} else if (request.method === 'DELETE') {
					rows[table] = rows[table].filter((row) => !selected.includes(row));
				} else if (request.method !== 'GET') throw new Error('Unexpected Training provider method');
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
