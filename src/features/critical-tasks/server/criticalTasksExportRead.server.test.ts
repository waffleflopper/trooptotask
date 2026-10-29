import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
	createSupabaseCriticalTasksExportReader,
	type CriticalTasksExportTable
} from './criticalTasksExportRead.server';
import { createShiftingPostgrestClient, pagedIds } from '$lib/storage/test-support/shiftingPostgrest.server';

type Row = Record<string, unknown>;
const ORG = 'org-a';
const cases = [
	{
		table: 'ict_tasks',
		saved: {
			id: 'task-a',
			organization_id: ORG,
			task_code: 'RESP-1',
			title: 'Stored task',
			description: null,
			category: 'Clinical',
			mos: ['68V'],
			expiration_months: null,
			sort_order: 8,
			archived_at: '2026-08-01T01:02:03Z',
			created_at: '2020-01-01T01:02:03.123456Z',
			retained_extra: { active: false }
		}
	},
	{
		table: 'personnel_ict_completions',
		saved: {
			id: 'completion-a',
			organization_id: ORG,
			personnel_id: 'archived-person',
			ict_task_id: 'task-a',
			completed_at: '2026-08-01T01:02:03.123456Z',
			validation_method: 'Demonstration',
			validated_by: null,
			notes: 'Stored validation',
			logged_by: 'original-author',
			created_at: '2026-08-02T03:04:05.654321Z'
		}
	}
] as const;

function provider(table: CriticalTasksExportTable, saved: Row) {
	const owned: Row[] = Array.from({ length: 1001 }, (_, index) => ({
		...saved,
		id: `saved-${String(index).padStart(4, '0')}`,
		unknown_saved_history: { nested: [null, false, { value: '  LEGACY  ' }] },
		...(table === 'ict_tasks' ? { task_code: `RESP-${index}` } : { personnel_id: `archived-person-${index}` })
	}));
	const rows: Row[] = [{ ...saved, id: 'foreign-row', organization_id: 'org-b' }, ...owned];
	const state = { failFrom: null as number | null };
	const client = createClient('http://127.0.0.1:9', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (request.headers.get('authorization') !== 'Bearer synthetic-request-key')
					throw new Error('Export read must retain ordinary request authority');
				if (url.pathname.split('/').at(-1) !== table || (init?.method ?? 'GET') !== 'GET')
					throw new Error('Unexpected export provider operation');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.failFrom !== null && offset >= state.failFrom)
					return Response.json({ code: '42501', message: 'Saved rows unavailable' }, { status: 403 });
				let visible = rows;
				for (const [column, filter] of url.searchParams) {
					if (filter.startsWith('eq.')) visible = visible.filter((row) => String(row[column]) === filter.slice(3));
					if (filter === 'is.null') visible = visible.filter((row) => row[column] == null);
				}
				const ordering = url.searchParams.get('order');
				if (ordering) {
					const [column, direction] = ordering.split('.');
					visible = visible.toSorted(
						(a, b) => String(a[column]).localeCompare(String(b[column])) * (direction === 'desc' ? -1 : 1)
					);
				}
				const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000);
				const select = url.searchParams.get('select');
				return Response.json(
					visible
						.slice(offset, offset + limit)
						.map((row) =>
							!select || select === '*'
								? row
								: Object.fromEntries(select.split(',').map((column) => [column, row[column]]))
						)
				);
			}
		}
	});
	return { client, state, owned };
}

describe('Critical Tasks ordinary Organization export reads', () => {
	it.each(cases)('retains all saved $table fields and pages without foreign rows', async ({ table, saved }) => {
		const { client, owned } = provider(table, saved);
		expect(await createSupabaseCriticalTasksExportReader(client, ORG).listRows(table)).toEqual(owned);
		expect(await createSupabaseCriticalTasksExportReader(client, 'empty-org').listRows(table)).toEqual([]);
	});

	it.each(cases)('rejects $table provider failures without returning partial saved rows', async ({ table, saved }) => {
		const { client, state } = provider(table, saved);
		state.failFrom = 1000;
		await expect(createSupabaseCriticalTasksExportReader(client, ORG).listRows(table)).rejects.toThrow(
			'Saved rows unavailable'
		);
		state.failFrom = 0;
		await expect(createSupabaseCriticalTasksExportReader(client, ORG).listRows(table)).rejects.toThrow(
			'Saved rows unavailable'
		);
	});

	it('rejects an unrelated table before provider access', async () => {
		const fetch = vi.fn();
		const client = createClient('http://archive.invalid', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch }
		});
		await expect(
			createSupabaseCriticalTasksExportReader(client, ORG).listRows('access_requests' as CriticalTasksExportTable)
		).rejects.toMatchObject({ status: 400 });
		expect(fetch).not.toHaveBeenCalled();
	});

	it.each(cases)('returns each saved $table row once when physical order shifts between pages', async ({ table }) => {
		const ids = pagedIds(1001);
		const client = createShiftingPostgrestClient({ [table]: ids.map((id) => ({ id, organization_id: ORG })) });
		const rows = await createSupabaseCriticalTasksExportReader(client, ORG).listRows(table);
		expect(rows.map((row) => row.id).toSorted()).toEqual(ids);
	});
});
