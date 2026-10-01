import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { countRatingSchemeEntries, listRatingSchemeExportRows } from './ratingSchemeRead.server';

type Row = Record<string, unknown>;
const saved: Row = {
	id: 'eval-0000',
	organization_id: 'org-1',
	rated_person_id: 'archived-person',
	eval_type: 'OER',
	rater_person_id: 'saved-rater',
	rater_name: null,
	senior_rater_person_id: null,
	senior_rater_name: 'LTC External',
	intermediate_rater_person_id: null,
	intermediate_rater_name: null,
	reviewer_person_id: 'saved-reviewer',
	reviewer_name: null,
	rating_period_start: '2025-09-30',
	rating_period_end: '2026-09-29',
	status: 'completed',
	notes: 'Saved notes',
	report_type: '02',
	workflow_status: null,
	created_at: '2025-09-30T01:02:03.654321Z',
	updated_at: '2026-09-29T01:02:03.123456Z'
};

function provider(rows: Row[], failAt?: number) {
	const requests: string[] = [];
	const store = createSupabaseDataStore(
		createClient('http://127.0.0.1:9', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					requests.push(url.pathname);
					if (!url.pathname.endsWith('/rating_scheme_entries')) throw new Error('Personnel lookup unavailable');
					const offset = Number(url.searchParams.get('offset') ?? 0);
					if (failAt !== undefined && offset >= failAt)
						return Response.json({ message: 'Rating unavailable' }, { status: 403 });
					const visible = rows
						.filter((row) => url.searchParams.get('organization_id') === `eq.${row.organization_id}`)
						.sort((a, b) => String(a.id).localeCompare(String(b.id)));
					const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000);
					const columns = url.searchParams.get('select');
					const data = visible
						.slice(offset, offset + limit)
						.map((row) =>
							!columns || columns === '*'
								? row
								: Object.fromEntries(columns.split(',').map((column) => [column, row[column]]))
						);
					return Response.json(data, {
						headers: { 'Content-Range': `${offset}-${offset + data.length - 1}/${visible.length}` }
					});
				}
			}
		})
	);
	return { store, requests };
}

function actor(ratingScheme: 'none' | 'view' = 'view') {
	return createTestAuthContext({
		orgId: 'org-1',
		role: 'member',
		isPrivileged: false,
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme
		}
	});
}

describe('Rating Scheme reverse reads', () => {
	it('exports all raw saved fields and statuses across pages without another Organization or Personnel lookup', async () => {
		const rows: Row[] = Array.from({ length: 1001 }, (_, i) => ({
			...saved,
			id: `eval-${String(i).padStart(4, '0')}`
		}));
		rows[1000] = { ...rows[1000], status: 'change-of-rater', workflow_status: 'with-rater' };
		const { store } = provider([...rows, { ...saved, id: 'foreign', organization_id: 'org-2' }].reverse());
		const result = await listRatingSchemeExportRows(store, 'org-1');
		expect(result).toEqual(rows);
		expect(result[0]).toEqual(saved);
	});

	it('fails the entire raw export when a later page is unavailable', async () => {
		const rows: Row[] = Array.from({ length: 1001 }, (_, i) => ({
			...saved,
			id: `eval-${String(i).padStart(4, '0')}`
		}));
		await expect(listRatingSchemeExportRows(provider(rows, 1000).store, 'org-1')).rejects.toThrow('Rating unavailable');
	});

	it('counts the Rating-only request-visible lane without a Personnel read', async () => {
		const { store } = provider([
			{ ...saved, id: 'own' },
			{ ...saved, id: 'foreign', organization_id: 'org-2' }
		]);
		await expect(countRatingSchemeEntries({ store, actor: actor() })).resolves.toBe(1);
	});

	it.each(['denied', 'empty scope'])('returns zero before provider access for %s', async (reason) => {
		const findManyWithCount = vi.fn();
		const trusted = actor(reason === 'denied' ? 'none' : 'view');
		if (reason === 'empty scope') Object.assign(trusted, { scopeSet: { kind: 'groups', groupIds: [] } });
		await expect(countRatingSchemeEntries({ store: { findManyWithCount }, actor: trusted })).resolves.toBe(0);
		expect(findManyWithCount).not.toHaveBeenCalled();
	});

	it('propagates an admitted count failure instead of treating it as an empty lane', async () => {
		await expect(countRatingSchemeEntries({ store: provider([], 0).store, actor: actor() })).rejects.toThrow(
			'Rating unavailable'
		);
	});
});
