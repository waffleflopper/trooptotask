import { createClient } from '@supabase/supabase-js';

type OnboardingTable =
	| 'onboarding_templates'
	| 'onboarding_template_steps'
	| 'personnel_onboardings'
	| 'onboarding_step_progress';
type Row = Record<string, unknown>;
type ProviderRequest = { table: OnboardingTable; method: string; offset: number; url: URL; body: unknown };

export function onboardingProvider(initial: Partial<Record<OnboardingTable, Row[]>> = {}) {
	const rows: Record<OnboardingTable, Row[]> = {
		onboarding_templates: [],
		onboarding_template_steps: [],
		personnel_onboardings: [],
		onboarding_step_progress: [],
		...structuredClone(initial)
	};
	const requests: ProviderRequest[] = [];
	const state = {
		rows,
		requests,
		nullData: false,
		countNull: false,
		unstablePages: false,
		failure: null as null | ((request: ProviderRequest) => { code: string; message: string; status: number } | null)
	};
	let nextId = 1;
	const client = createClient('http://onboarding.invalid', 'synthetic-onboarding-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.origin !== 'http://onboarding.invalid') throw new Error('Unexpected Onboarding provider origin');
				if (
					request.headers.get('authorization') !== 'Bearer synthetic-onboarding-request-key' ||
					request.headers.get('apikey') !== 'synthetic-onboarding-request-key'
				)
					throw new Error('Onboarding must retain ordinary request credentials');
				const table = url.pathname.replace('/rest/v1/', '') as OnboardingTable;
				if (!Object.hasOwn(rows, table)) throw new Error('Unexpected Onboarding provider table');
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
							} else throw new Error('Unexpected Onboarding predicate');
						}
						return true;
					}
				);
				if (request.method === 'POST') {
					const inputs: Row[] = Array.isArray(body) ? body : [body];
					selected = inputs.map((input) => {
						const row = {
							...input,
							id: input.id ?? `saved-${nextId++}`,
							created_at: '2026-10-07T12:00:00.123456Z'
						};
						rows[table].push(row);
						return row;
					});
				} else if (request.method === 'PATCH') {
					for (const row of selected) Object.assign(row, body);
				} else if (request.method === 'DELETE') {
					rows[table] = rows[table].filter((row) => !selected.includes(row));
				} else if (request.method !== 'GET') throw new Error('Unexpected Onboarding provider method');
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
				if (request.method === 'GET')
					selected = selected.slice(
						operation.offset,
						operation.offset + Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000)
					);
				const projection = url.searchParams.get('select');
				const result = selected.map((row) => {
					if (!projection || projection === '*') return row;
					const packet = projection.includes('onboarding_step_progress(');
					const columns = (packet ? projection.split(', onboarding_step_progress(')[0] : projection)
						.split(',')
						.map((column) => column.trim());
					const saved = Object.fromEntries(
						columns.filter((column) => column in row).map((column) => [column, row[column]])
					);
					if (packet)
						saved.onboarding_step_progress = rows.onboarding_step_progress
							.filter((step) => step.onboarding_id === row.id && step.organization_id === row.organization_id)
							.map((step) =>
								Object.fromEntries(
									[
										'id',
										'onboarding_id',
										'step_name',
										'step_type',
										'training_type_id',
										'stages',
										'sort_order',
										'completed',
										'current_stage',
										'notes',
										'template_step_id',
										'active'
									]
										.filter((key) => key in step)
										.map((key) => [key, step[key]])
								)
							);
					return saved;
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
						request.headers.get('prefer')?.includes('count=estimated') && !state.countNull
							? { 'content-range': `0-${Math.max(0, result.length - 1)}/${count}` }
							: {}
				});
			}
		}
	});
	return { client, state };
}
