import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

/** Sorted, zero-padded IDs so string order and numeric order agree past one page. */
export function pagedIds(count: number, prefix = 'row'): string[] {
	return Array.from({ length: count }, (_, index) => `${prefix}-${String(index).padStart(5, '0')}`);
}

function topLevelColumns(select: string): string[] {
	const columns: string[] = [];
	let depth = 0;
	let current = '';
	for (const character of select) {
		if (character === '(') depth++;
		if (character === ')') depth--;
		if (character === ',' && depth === 0) {
			columns.push(current);
			current = '';
		} else current += character;
	}
	columns.push(current);
	return columns.map((column) => column.trim().split('(')[0]);
}

function matches(row: Row, column: string, filter: string): boolean {
	const value = row[column];
	const [operator, ...rest] = filter.split('.');
	const operand = rest.join('.');
	if (operator === 'not') return !matches(row, column, operand);
	if (operator === 'eq') return String(value) === operand;
	if (operator === 'in')
		return operand
			.slice(1, -1)
			.split(',')
			.map((item) => item.replace(/^"|"$/g, ''))
			.includes(String(value));
	if (operator === 'gt') return String(value) > operand;
	throw new Error(`Unsupported PostgREST filter ${column}=${filter}`);
}

function compare(a: Row, b: Row, order: string): number {
	for (const term of order.split(',')) {
		const [column, direction] = term.split('.');
		const left = String(a[column]);
		const right = String(b[column]);
		if (left !== right) return (left < right ? -1 : 1) * (direction === 'desc' ? -1 : 1);
	}
	return 0;
}

/**
 * A PostgREST stand-in whose physical row order shifts by one row on every request, as a
 * table's heap order may between OFFSET pages. Only an ORDER BY a unique key pages it stably.
 */
export function createShiftingPostgrestClient(tables: Record<string, Row[]>): SupabaseClient {
	let requests = 0;
	return createClient('http://shifting-postgrest.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				const table = url.pathname.replace('/rest/v1/', '');
				const rows = tables[table];
				if (request.method !== 'GET' || !rows) throw new Error(`Unexpected ${request.method} ${url.pathname}`);
				const shift = requests++ % Math.max(rows.length, 1);
				let visible = [...rows.slice(shift), ...rows.slice(0, shift)];
				for (const [column, filter] of url.searchParams) {
					if (['select', 'order', 'offset', 'limit'].includes(column)) continue;
					visible = visible.filter((row) => matches(row, column, filter));
				}
				const order = url.searchParams.get('order');
				if (order) visible = visible.toSorted((a, b) => compare(a, b, order));
				const offset = Number(url.searchParams.get('offset') ?? 0);
				const page = visible.slice(offset, offset + Number(url.searchParams.get('limit') ?? visible.length));
				const select = url.searchParams.get('select') ?? '*';
				if (select === '*') return Response.json(page);
				const columns = topLevelColumns(select);
				return Response.json(page.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))));
			}
		}
	});
}
