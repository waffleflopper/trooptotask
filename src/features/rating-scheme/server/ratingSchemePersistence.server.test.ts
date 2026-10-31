import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseRatingSchemePersistence } from './ratingSchemePersistence.server';

type Row = Record<string, unknown>;

const saved: Row = {
	id: 'entry-a',
	organization_id: 'org-a',
	rated_person_id: 'person-a',
	eval_type: 'OER',
	rater_person_id: 'rater-a',
	rater_name: null,
	senior_rater_person_id: null,
	senior_rater_name: 'COL Synthetic Senior',
	intermediate_rater_person_id: null,
	intermediate_rater_name: 'LTC Synthetic Intermediate',
	reviewer_person_id: 'reviewer-a',
	reviewer_name: null,
	rating_period_start: '2025-10-05',
	rating_period_end: '2026-10-04',
	status: 'change-of-rater',
	notes: 'Saved historical notes',
	report_type: 'CR',
	workflow_status: 'with-rater',
	created_at: '2025-10-05T12:00:00.654321+00:00',
	updated_at: '2026-10-05T12:00:00.123456+00:00',
	extra_saved_field: 'private provider value'
};

const expected = {
	id: 'entry-a',
	organization_id: 'org-a',
	ratedPersonId: 'person-a',
	evalType: 'OER',
	raterPersonId: 'rater-a',
	raterName: null,
	seniorRaterPersonId: null,
	seniorRaterName: 'COL Synthetic Senior',
	intermediateRaterPersonId: null,
	intermediateRaterName: 'LTC Synthetic Intermediate',
	reviewerPersonId: 'reviewer-a',
	reviewerName: null,
	ratingPeriodStart: '2025-10-05',
	ratingPeriodEnd: '2026-10-04',
	status: 'change-of-rater',
	notes: 'Saved historical notes',
	reportType: 'CR',
	workflowStatus: 'with-rater',
	created_at: '2025-10-05T12:00:00.654321+00:00',
	updated_at: '2026-10-05T12:00:00.123456+00:00'
};

const savedFields = new Set([
	'id',
	'organization_id',
	'rated_person_id',
	'eval_type',
	'rater_person_id',
	'rater_name',
	'senior_rater_person_id',
	'senior_rater_name',
	'intermediate_rater_person_id',
	'intermediate_rater_name',
	'reviewer_person_id',
	'reviewer_name',
	'rating_period_start',
	'rating_period_end',
	'status',
	'notes',
	'report_type',
	'workflow_status',
	'created_at',
	'updated_at'
]);

const input = {
	ratedPersonId: 'person-a',
	evalType: 'NCOER' as const,
	ratingPeriodStart: '2026-10-05',
	ratingPeriodEnd: '2027-10-04',
	status: 'active' as const
};

function provider(initial: Row[] = []) {
	const rows = structuredClone(initial);
	const state = {
		requests: [] as Array<{ url: URL; method: string; body: unknown; prefer: string | null }>,
		failOffset: -1,
		rejectMethod: '',
		omitCount: false,
		revokeDelete: false
	};
	const client = createClient('http://rating-ledger.invalid', 'ordinary-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				const body: unknown = ['GET', 'HEAD', 'DELETE'].includes(request.method) ? null : await request.json();
				state.requests.push({ url, method: request.method, body, prefer: request.headers.get('prefer') });
				if (
					state.requests.length > 40 ||
					url.origin !== 'http://rating-ledger.invalid' ||
					url.pathname !== '/rest/v1/rating_scheme_entries'
				)
					throw new Error('Unexpected Rating provider operation');
				if (
					request.headers.get('authorization') !== 'Bearer ordinary-request-key' ||
					request.headers.get('apikey') !== 'ordinary-request-key'
				)
					throw new Error('Rating provider changed supplied authority');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.rejectMethod === request.method || (request.method === 'GET' && state.failOffset === offset))
					return Response.json({ code: '42501', message: 'Rating provider unavailable' }, { status: 403 });
				let affected = rows.filter((row) => {
					for (const [column, filter] of url.searchParams) {
						if (['select', 'order', 'offset', 'limit'].includes(column)) continue;
						if (!filter.startsWith('eq.')) throw new Error('Unexpected Rating predicate');
						if (String(row[column]) !== filter.slice(3)) return false;
					}
					return true;
				});
				const total = affected.length;
				if (request.method === 'HEAD') {
					const exact = request.headers.get('prefer')?.includes('count=exact') && !state.omitCount;
					return new Response(null, { status: 200, headers: exact ? { 'Content-Range': `*/${total}` } : {} });
				}
				if (request.method === 'GET') {
					const order = url.searchParams.get('order');
					if (order)
						affected.sort((a, b) => {
							for (const term of order.split(',')) {
								const [column, direction] = term.split('.');
								const comparison = String(a[column]).localeCompare(String(b[column]));
								if (comparison) return direction === 'desc' ? -comparison : comparison;
							}
							return 0;
						});
					affected = affected.slice(offset, offset + Number(url.searchParams.get('limit') ?? 1000));
				} else if (request.method === 'POST' || request.method === 'PATCH') {
					const values = body as Row;
					if (request.method === 'POST') {
						affected = [
							{
								id: `saved-${rows.length + 1}`,
								created_at: '2026-10-06T12:00:00.123456+00:00',
								updated_at: '2026-10-06T12:00:00.123456+00:00',
								...values
							}
						];
						rows.push(...affected);
					} else {
						for (const row of affected) Object.assign(row, values, { updated_at: '2026-10-06T13:00:00.654321+00:00' });
					}
				} else if (request.method === 'DELETE') {
					if (!state.revokeDelete) for (const row of affected) rows.splice(rows.indexOf(row), 1);
					return new Response(null, { status: 204 });
				} else throw new Error('Unexpected Rating method');
				const select = url.searchParams.get('select');
				const projected = affected.map((row) => ({
					...Object.fromEntries((select ?? '').split(',').map((field) => [field, row[field]])),
					extra_saved_field: 'unexpected provider response field'
				}));
				if (request.headers.get('accept') === 'application/vnd.pgrst.object+json') {
					if (projected.length !== 1)
						return Response.json({ code: 'PGRST116', message: 'Expected one Rating entry' }, { status: 406 });
					return Response.json(projected[0]);
				}
				const headers: Record<string, string> =
					request.headers.get('prefer')?.includes('count=estimated') && !state.omitCount
						? { 'Content-Range': `${offset}-${offset + projected.length - 1}/${total}` }
						: {};
				return Response.json(projected, { headers });
			}
		}
	});
	return { rows, state, ratingScheme: createSupabaseRatingSchemePersistence(client, 'org-a') };
}

describe('owned Rating Scheme provider', () => {
	it('returns all20 supported saved fields with exact metadata and excludes unrelated provider fields', async () => {
		const { ratingScheme, state } = provider([
			{ ...saved, id: 'later', rating_period_end: '2027-01-01' },
			saved,
			{ ...saved, id: 'foreign', organization_id: 'org-b' }
		]);
		expect(await ratingScheme.listWorkspace()).toEqual([
			expected,
			{ ...expected, id: 'later', ratingPeriodEnd: '2027-01-01' }
		]);
		expect(state.requests).toHaveLength(1);
		expect(new Set(state.requests[0].url.searchParams.get('select')?.split(','))).toEqual(savedFields);
	});

	it('loads all1001 tied-date workspace entries in stable ascending identity order', async () => {
		const ids = Array.from({ length: 1001 }, (_, i) => `entry-${String(i).padStart(4, '0')}`);
		const { ratingScheme, state } = provider(ids.map((id) => ({ ...saved, id })).reverse());
		const result = await ratingScheme.listWorkspace();
		expect(result.map((entry) => entry.id)).toEqual(ids);
		expect(result[1000]).toEqual({ ...expected, id: 'entry-1000' });
		expect(state.requests.map(({ url }) => url.searchParams.get('offset'))).toEqual(['0', '1000']);
	});

	it('loads complete Person readiness entries in descending period/identity order', async () => {
		const rows = Array.from({ length: 1001 }, (_, i) => ({
			...saved,
			id: `entry-${String(i).padStart(4, '0')}`,
			rater_name: `Rater ${i}`
		}));
		const { ratingScheme } = provider([
			...rows,
			{ ...saved, id: 'earlier', rating_period_end: '2025-12-31', rater_name: 'Earlier Rater' },
			{ ...saved, id: 'foreign', organization_id: 'org-b' },
			{ ...saved, id: 'another', rated_person_id: 'person-b' }
		]);
		const result = await ratingScheme.listPersonReadiness('person-a');
		expect(result).toHaveLength(1002);
		expect(result[0]).toEqual({ ...expected, id: 'entry-1000', raterName: 'Rater 1000' });
		expect(result[1000].raterName).toBe('Rater 0');
		expect(result[1001].raterName).toBe('Earlier Rater');
		expect(await ratingScheme.listPersonReadiness('missing')).toEqual([]);
	});

	it.each([0, 1000])('rejects both complete reads when page%i fails', async (offset) => {
		const { ratingScheme, state } = provider(Array.from({ length: 1001 }, (_, i) => ({ ...saved, id: `entry-${i}` })));
		state.failOffset = offset;
		await expect(ratingScheme.listWorkspace()).rejects.toThrow('Rating provider unavailable');
		await expect(ratingScheme.listPersonReadiness('person-a')).rejects.toThrow('Rating provider unavailable');
	});

	it('maps only write-reference relationships and classifies missing single rows without hiding provider failures', async () => {
		const { ratingScheme, state } = provider([saved, { ...saved, id: 'foreign', organization_id: 'org-b' }]);
		expect(await ratingScheme.findWriteReference('entry-a')).toEqual({
			ratedPersonId: 'person-a',
			raterPersonId: 'rater-a',
			seniorRaterPersonId: null,
			intermediateRaterPersonId: null,
			reviewerPersonId: 'reviewer-a'
		});
		expect(await ratingScheme.findWriteReference('missing')).toBeNull();
		expect(await ratingScheme.findWriteReference('foreign')).toBeNull();
		state.rejectMethod = 'GET';
		await expect(ratingScheme.findWriteReference('entry-a')).rejects.toThrow('Rating provider unavailable');
	});

	it('counts the unit exactly with a head request, missing count as zero and provider error propagation', async () => {
		const { ratingScheme, state } = provider([
			saved,
			{ ...saved, id: 'second' },
			{ ...saved, id: 'foreign', organization_id: 'org-b' }
		]);
		expect(await ratingScheme.countEntries()).toBe(2);
		const request = state.requests[0];
		expect(request.method).toBe('HEAD');
		expect(request.prefer).toContain('count=exact');
		expect(request.url.searchParams.get('select')).toBe('id');
		state.omitCount = true;
		expect(await ratingScheme.countEntries()).toBe(0);
		state.rejectMethod = 'HEAD';
		await expect(ratingScheme.countEntries()).rejects.toThrow('Rating provider unavailable');
	});

	it('creates owned values with nullable defaults, ignores supplied protected fields and preserves string codes', async () => {
		const { ratingScheme, rows, state } = provider();
		const supplied = {
			...input,
			id: 'must not choose ID',
			organization_id: 'foreign',
			created_at: 'must not choose timestamp',
			updated_at: 'must not choose timestamp',
			extra_saved_field: 'must not write',
			raterName: '',
			seniorRaterName: 'COL Synthetic Senior',
			reportType: 'historical-report',
			workflowStatus: 'historical-workflow'
		};
		const result = await ratingScheme.create(supplied);
		expect(result).toEqual({
			id: 'saved-1',
			organization_id: 'org-a',
			ratedPersonId: 'person-a',
			evalType: 'NCOER',
			raterPersonId: null,
			raterName: null,
			seniorRaterPersonId: null,
			seniorRaterName: 'COL Synthetic Senior',
			intermediateRaterPersonId: null,
			intermediateRaterName: null,
			reviewerPersonId: null,
			reviewerName: null,
			ratingPeriodStart: '2026-10-05',
			ratingPeriodEnd: '2027-10-04',
			status: 'active',
			notes: null,
			reportType: 'historical-report',
			workflowStatus: 'historical-workflow',
			created_at: '2026-10-06T12:00:00.123456+00:00',
			updated_at: '2026-10-06T12:00:00.123456+00:00'
		});
		expect(rows[0].organization_id).toBe('org-a');
		expect(rows[0]).not.toHaveProperty('extra_saved_field');
		expect(new Set(Object.keys(state.requests[0].body as Row))).toEqual(
			new Set([...savedFields].filter((field) => !['id', 'created_at', 'updated_at'].includes(field)))
		);
	});

	it('patches defined nullable values while preserving omitted fields, stored identity and creation timestamp', async () => {
		const { ratingScheme, rows, state } = provider([saved, { ...saved, organization_id: 'org-b' }]);
		const supplied = {
			id: 'foreign',
			organization_id: 'org-b',
			created_at: 'must not change',
			updated_at: 'must not change',
			notes: null,
			raterPersonId: '',
			intermediateRaterName: null,
			reviewerName: undefined
		};
		expect(await ratingScheme.update('entry-a', supplied)).toEqual({
			...expected,
			raterPersonId: null,
			intermediateRaterName: null,
			notes: null,
			updated_at: '2026-10-06T13:00:00.654321+00:00'
		});
		expect(state.requests[0].body).toEqual({ rater_person_id: null, intermediate_rater_name: null, notes: null });
		expect(rows[1]).toEqual({ ...saved, organization_id: 'org-b' });
	});

	it('propagates failed create/update, answers null for a missing update and leaves unrelated rows unchanged', async () => {
		const { ratingScheme, rows, state } = provider([saved]);
		const before = structuredClone(rows);
		state.rejectMethod = 'POST';
		await expect(ratingScheme.create(input)).rejects.toThrow('Rating provider unavailable');
		state.rejectMethod = 'PATCH';
		await expect(ratingScheme.update('entry-a', { notes: 'must not change' })).rejects.toThrow(
			'Rating provider unavailable'
		);
		state.rejectMethod = '';
		await expect(ratingScheme.update('missing', { notes: 'must not change' })).resolves.toBeNull();
		expect(rows).toEqual(before);
	});

	it('keeps ordinary idempotent deletion, failed delivery and revoked-RLS zero effects separate', async () => {
		const { ratingScheme, rows, state } = provider([saved, { ...saved, organization_id: 'org-b' }]);
		const before = structuredClone(rows);
		state.rejectMethod = 'DELETE';
		await expect(ratingScheme.delete('entry-a')).rejects.toThrow('Rating provider unavailable');
		expect(rows).toEqual(before);
		state.rejectMethod = '';
		state.revokeDelete = true;
		await expect(ratingScheme.delete('entry-a')).resolves.toBeUndefined();
		expect(rows).toEqual(before);
		state.revokeDelete = false;
		await ratingScheme.delete('entry-a');
		await ratingScheme.delete('entry-a');
		expect(rows).toEqual([{ ...saved, organization_id: 'org-b' }]);
		for (const { url, prefer } of state.requests) {
			expect(url.searchParams.get('organization_id')).toBe('eq.org-a');
			expect(url.searchParams.get('id')).toBe('eq.entry-a');
			expect(url.searchParams.has('select')).toBe(false);
			expect(prefer ?? '').not.toContain('return=representation');
		}
	});
});
