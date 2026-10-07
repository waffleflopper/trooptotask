import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseOnboardingExportReader, type OnboardingExportTable } from './onboardingExportRead.server';

type Row = Record<string, unknown>;
const ORG = 'org-a';
const cases = [
	{
		table: 'onboarding_templates',
		saved: {
			name: 'Retired template',
			description: null,
			archived_at: '2026-01-02T03:04:05.123456Z',
			created_at: '2020-01-01T00:00:00.654321Z'
		}
	},
	{
		table: 'onboarding_template_steps',
		saved: {
			template_id: 'retired-template',
			name: 'Saved work',
			step_type: 'legacy',
			stages: [null, 'Filed'],
			training_type_id: null,
			sort_order: 3
		}
	},
	{
		table: 'personnel_onboardings',
		saved: {
			personnel_id: 'archived-person',
			template_id: null,
			status: 'cancelled',
			started_at: '2020-01-01',
			completed_at: null,
			cancelled_at: '2026-01-02T03:04:05.123456Z'
		}
	},
	{
		table: 'onboarding_step_progress',
		saved: {
			onboarding_id: 'cancelled-packet',
			template_step_id: null,
			step_name: 'Saved work',
			step_type: 'legacy',
			stages: ['Submitted', 'Filed'],
			current_stage: 'Retired stage',
			completed: true,
			active: false,
			notes: [{ text: 'Retained work', timestamp: '2026-01-02T03:04:05.123456Z', userId: 'former-author' }]
		}
	}
] as const;

function provider(table: OnboardingExportTable, saved: Row) {
	const owned: Row[] = Array.from({ length: 1001 }, (_, index) => ({
		...saved,
		id: `saved-${String(1001 - index).padStart(4, '0')}`,
		organization_id: ORG,
		unknown_saved_history: { nested: [null, false, { value: '  LEGACY  ' }] }
	}));
	const rows: Row[] = [{ ...owned[0], id: 'foreign-row', organization_id: 'org-b' }, ...owned];

	const state = { failFrom: null as number | null, nullData: false };
	const client = createClient('http://archive.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.origin !== 'http://archive.invalid' || url.pathname !== `/rest/v1/${table}` || request.method !== 'GET')
					throw new Error('Unexpected archive provider operation');
				if (
					request.headers.get('authorization') !== 'Bearer synthetic-request-key' ||
					request.headers.get('apikey') !== 'synthetic-request-key'
				)
					throw new Error('Archive read must retain ordinary request authority');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.failFrom !== null && offset >= state.failFrom)
					return Response.json({ code: '42501', message: 'Saved rows unavailable' }, { status: 403 });
				if (state.nullData) return Response.json(null);
				let visible = offset > 0 ? rows.toReversed() : rows;
				for (const [column, filter] of url.searchParams) {
					if (filter.startsWith('eq.')) visible = visible.filter((row) => String(row[column]) === filter.slice(3));
					else if (!['select', 'order', 'offset', 'limit'].includes(column))
						throw new Error('Unexpected archive predicate');
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
								: Object.fromEntries(select.split(',').map((column) => [column.trim(), row[column.trim()]]))
						)
				);
			}
		}
	});
	return { client, state, owned };
}

describe('Onboarding ordinary Organization archive reads', () => {
	it.each(cases)(
		'retains saved $table rows across pages and excludes a foreign Organization',
		async ({ table, saved }) => {
			const { client, owned } = provider(table, saved);
			const expected = owned.toSorted((a, b) => String(a.id).localeCompare(String(b.id)));
			expect(await createSupabaseOnboardingExportReader(client, ORG).listRows(table)).toEqual(expected);
			expect(expected.map((row) => row.id)).toEqual(
				Array.from({ length: 1001 }, (_, index) => `saved-${String(index + 1).padStart(4, '0')}`)
			);
			expect(await createSupabaseOnboardingExportReader(client, 'empty-org').listRows(table)).toEqual([]);
		}
	);

	it.each(cases)(
		'rejects first and late $table failures without returning partial history',
		async ({ table, saved }) => {
			const { client, state } = provider(table, saved);
			for (const from of [0, 1000]) {
				state.failFrom = from;
				await expect(createSupabaseOnboardingExportReader(client, ORG).listRows(table)).rejects.toThrow(
					'Saved rows unavailable'
				);
			}
		}
	);

	it('keeps an error-free null provider response empty', async () => {
		const { client, state } = provider(cases[0].table, cases[0].saved);
		state.nullData = true;
		expect(await createSupabaseOnboardingExportReader(client, ORG).listRows(cases[0].table)).toEqual([]);
	});

	it('rejects an unrelated table before provider access', async () => {
		const fetch = vi.fn();
		const client = createClient('http://archive.invalid', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch }
		});
		await expect(
			createSupabaseOnboardingExportReader(client, ORG).listRows('access_requests' as OnboardingExportTable)
		).rejects.toMatchObject({ status: 400 });
		expect(fetch).not.toHaveBeenCalled();
	});
});
