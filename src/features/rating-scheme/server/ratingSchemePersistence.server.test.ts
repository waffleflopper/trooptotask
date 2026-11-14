import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseRatingSchemePersistence } from './ratingSchemePersistence.server';

type Row = Record<string, unknown>;
type Table = 'rating_schemes' | 'evaluations';

const schemeRow: Row = {
	id: 'scheme-a',
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
	notes: 'Scheme notes',
	archived_at: null,
	archived_by: 'who-archived',
	created_at: '2025-10-05T12:00:00.654321+00:00',
	updated_at: '2026-10-05T12:00:00.123456+00:00'
};

const scheme = {
	id: 'scheme-a',
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
	notes: 'Scheme notes',
	archivedAt: null
};

const snapshotColumns = {
	snapshot_rater_person_id: null,
	snapshot_rater_name: null,
	snapshot_senior_rater_person_id: null,
	snapshot_senior_rater_name: null,
	snapshot_intermediate_rater_person_id: null,
	snapshot_intermediate_rater_name: null,
	snapshot_reviewer_person_id: null,
	snapshot_reviewer_name: null
};

const evaluationRow: Row = {
	id: 'evaluation-a',
	organization_id: 'org-a',
	rating_scheme_id: 'scheme-a',
	rated_person_id: 'person-a',
	eval_type: 'OER',
	report_type: 'CR',
	rating_period_start: '2025-10-05',
	rating_period_end: '2026-10-04',
	workflow_status: 'with-rater',
	notes: 'Evaluation notes',
	chain_snapshot_at: null,
	...snapshotColumns,
	created_at: '2025-10-05T12:00:00.654321+00:00',
	updated_at: '2026-10-05T12:00:00.123456+00:00'
};

const evaluation = {
	id: 'evaluation-a',
	ratingSchemeId: 'scheme-a',
	ratedPersonId: 'person-a',
	evalType: 'OER',
	reportType: 'CR',
	ratingPeriodStart: '2025-10-05',
	ratingPeriodEnd: '2026-10-04',
	workflowStatus: 'with-rater',
	notes: 'Evaluation notes',
	signedChain: null
};

function provider(initial: { rating_schemes?: Row[]; evaluations?: Row[] } = {}) {
	const tables: Record<Table, Row[]> = {
		rating_schemes: structuredClone(initial.rating_schemes ?? []),
		evaluations: structuredClone(initial.evaluations ?? [])
	};
	const state = {
		requests: [] as Array<{ url: URL; method: string; body: unknown; prefer: string | null }>,
		failOffset: -1,
		rejectMethod: '',
		omitCount: false
	};
	const client = createClient('http://rating-ledger.invalid', 'ordinary-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				const body: unknown = ['GET', 'HEAD', 'DELETE'].includes(request.method) ? null : await request.json();
				state.requests.push({ url, method: request.method, body, prefer: request.headers.get('prefer') });
				const table = url.pathname.replace('/rest/v1/', '') as Table;
				if (state.requests.length > 40 || url.origin !== 'http://rating-ledger.invalid' || !(table in tables))
					throw new Error('Unexpected Rating provider operation');
				if (request.headers.get('authorization') !== 'Bearer ordinary-request-key')
					throw new Error('Rating provider changed supplied authority');
				const rows = tables[table];
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.rejectMethod === request.method || (request.method === 'GET' && state.failOffset === offset))
					return Response.json({ code: '42501', message: 'Rating provider unavailable' }, { status: 403 });
				let affected = rows.filter((row) => {
					for (const [column, filter] of url.searchParams) {
						if (['select', 'order', 'offset', 'limit'].includes(column)) continue;
						if (column === 'or') {
							if (!matchesAny(row, filter)) return false;
							continue;
						}
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
				} else if (request.method === 'POST') {
					affected = [{ id: `saved-${rows.length + 1}`, archived_at: null, ...(body as Row) }];
					rows.push(...affected);
				} else if (request.method === 'PATCH') {
					for (const row of affected) Object.assign(row, body as Row);
				} else if (request.method === 'DELETE') {
					for (const row of affected) rows.splice(rows.indexOf(row), 1);
					return new Response(null, { status: 204 });
				} else throw new Error('Unexpected Rating method');
				const projected = affected.map((row) => project(row, url.searchParams.get('select') ?? '', tables));
				if (request.headers.get('accept') === 'application/vnd.pgrst.object+json') {
					if (projected.length !== 1)
						return Response.json({ code: 'PGRST116', message: 'Expected one Rating row' }, { status: 406 });
					return Response.json(projected[0]);
				}
				return Response.json(projected);
			}
		}
	});
	return { tables, state, ratingScheme: createSupabaseRatingSchemePersistence(client, 'org-a') };
}

/** An `or=(column.is.null,column.neq.value)` filter, the only alternatives the provider sends. */
function matchesAny(row: Row, filter: string): boolean {
	return filter
		.slice(1, -1)
		.split(',')
		.some((term) => {
			const [column, operator, value] = term.split('.');
			if (operator === 'is' && value === 'null') return row[column] === null;
			if (operator === 'neq') return row[column] !== null && String(row[column]) !== value;
			throw new Error('Unexpected Rating predicate');
		});
}

/** Selected columns, and the one embed the provider reads: an Evaluation's scheme. */
function project(row: Row, select: string, tables: Record<Table, Row[]>) {
	const embed = /rating_schemes\(([^)]*)\)/.exec(select);
	const columns = select.replace(/,?rating_schemes\([^)]*\)/, '').split(',');
	const projected: Row = Object.fromEntries(columns.map((column) => [column, row[column]]));
	if (embed) {
		const parent = tables.rating_schemes.find((candidate) => candidate.id === row.rating_scheme_id);
		projected.rating_schemes = parent ? Object.fromEntries(embed[1].split(',').map((c) => [c, parent[c]])) : null;
	}
	return projected;
}

describe('owned Rating Scheme provider', () => {
	it('reads the unit’s schemes and Evaluations without who archived a scheme', async () => {
		const { ratingScheme, state } = provider({
			rating_schemes: [schemeRow, { ...schemeRow, id: 'foreign', organization_id: 'org-b' }],
			evaluations: [
				{ ...evaluationRow, id: 'later', rating_period_end: '2027-01-01' },
				evaluationRow,
				{ ...evaluationRow, id: 'foreign', organization_id: 'org-b' }
			]
		});
		expect(await ratingScheme.listRatingSchemes()).toEqual([scheme]);
		expect(await ratingScheme.listEvaluations()).toEqual([
			evaluation,
			{ ...evaluation, id: 'later', ratingPeriodEnd: '2027-01-01' }
		]);
		expect(state.requests[0].url.searchParams.get('select')).not.toContain('archived_by');
	});

	it('shows the chain that signed an Evaluation once it has one', async () => {
		const signed = {
			...evaluationRow,
			workflow_status: 'completed',
			chain_snapshot_at: '2026-10-05T12:00:00+00:00',
			snapshot_rater_name: 'SSG Signed Rater',
			snapshot_senior_rater_person_id: 'senior-a'
		};
		const { ratingScheme } = provider({ evaluations: [signed] });
		expect(await ratingScheme.listEvaluations()).toEqual([
			{
				...evaluation,
				workflowStatus: 'completed',
				signedChain: {
					signedAt: '2026-10-05T12:00:00+00:00',
					raterPersonId: null,
					raterName: 'SSG Signed Rater',
					seniorRaterPersonId: 'senior-a',
					seniorRaterName: null,
					intermediateRaterPersonId: null,
					intermediateRaterName: null,
					reviewerPersonId: null,
					reviewerName: null
				}
			}
		]);
	});

	it('loads every page of tied-date Evaluations in stable identity order', async () => {
		const ids = Array.from({ length: 1001 }, (_, i) => `evaluation-${String(i).padStart(4, '0')}`);
		const { ratingScheme, state } = provider({ evaluations: ids.map((id) => ({ ...evaluationRow, id })).reverse() });
		const result = await ratingScheme.listEvaluations();
		expect(result.map((row) => row.id)).toEqual(ids);
		expect(state.requests.map(({ url }) => url.searchParams.get('offset'))).toEqual(['0', '1000']);
	});

	it('reads one Person’s scheme and Evaluations, newest period first', async () => {
		const { ratingScheme } = provider({
			rating_schemes: [schemeRow, { ...schemeRow, id: 'scheme-b', rated_person_id: 'person-b' }],
			evaluations: [
				{ ...evaluationRow, id: 'earlier', rating_period_end: '2025-12-31' },
				evaluationRow,
				{ ...evaluationRow, id: 'another', rated_person_id: 'person-b' }
			]
		});
		const readiness = await ratingScheme.listPersonReadiness('person-a');
		expect(readiness.ratingSchemes).toEqual([scheme]);
		expect(readiness.evaluations.map((row) => row.id)).toEqual(['evaluation-a', 'earlier']);
		expect(await ratingScheme.listPersonReadiness('missing')).toEqual({ ratingSchemes: [], evaluations: [] });
	});

	it.each([0, 1000])('rejects a complete read when page %i fails', async (offset) => {
		const { ratingScheme, state } = provider({
			evaluations: Array.from({ length: 1001 }, (_, i) => ({ ...evaluationRow, id: `evaluation-${i}` }))
		});
		state.failOffset = offset;
		await expect(ratingScheme.listEvaluations()).rejects.toThrow('Rating provider unavailable');
	});

	it('reads an Evaluation’s write reference through its scheme’s rater', async () => {
		const { ratingScheme, state } = provider({
			rating_schemes: [schemeRow],
			evaluations: [evaluationRow, { ...evaluationRow, id: 'foreign', organization_id: 'org-b' }]
		});
		expect(await ratingScheme.findEvaluationReference('evaluation-a')).toEqual({
			ratingSchemeId: 'scheme-a',
			ratedPersonId: 'person-a',
			raterPersonId: 'rater-a'
		});
		expect(await ratingScheme.findEvaluationReference('foreign')).toBeNull();
		expect(await ratingScheme.findRatingScheme('scheme-a')).toEqual(scheme);
		expect(await ratingScheme.findRatingScheme('missing')).toBeNull();
		state.rejectMethod = 'GET';
		await expect(ratingScheme.findEvaluationReference('evaluation-a')).rejects.toThrow('Rating provider unavailable');
	});

	it('counts the unit’s rating schemes with a head request', async () => {
		const { ratingScheme, state } = provider({
			rating_schemes: [
				schemeRow,
				{ ...schemeRow, id: 'second' },
				{ ...schemeRow, id: 'foreign', organization_id: 'org-b' }
			]
		});
		expect(await ratingScheme.countRatingSchemes()).toBe(2);
		expect(state.requests[0]).toMatchObject({ method: 'HEAD' });
		state.omitCount = true;
		expect(await ratingScheme.countRatingSchemes()).toBe(0);
		state.rejectMethod = 'HEAD';
		await expect(ratingScheme.countRatingSchemes()).rejects.toThrow('Rating provider unavailable');
	});

	it('creates a scheme in this unit with only its own values', async () => {
		const { ratingScheme, tables, state } = provider();
		const created = await ratingScheme.createRatingScheme({
			ratedPersonId: 'person-a',
			evalType: 'NCOER',
			raterName: '',
			seniorRaterName: 'COL Synthetic Senior'
		});
		expect(created).toEqual({
			...scheme,
			id: 'saved-1',
			evalType: 'NCOER',
			raterPersonId: null,
			seniorRaterName: 'COL Synthetic Senior',
			intermediateRaterName: null,
			reviewerPersonId: null,
			notes: null
		});
		expect(tables.rating_schemes[0].organization_id).toBe('org-a');
		expect(Object.keys(state.requests[0].body as Row)).not.toEqual(
			expect.arrayContaining(['archived_at', 'archived_by'])
		);
	});

	it('patches only supplied values on a scheme or an Evaluation and answers null when it is gone', async () => {
		const { ratingScheme, tables, state } = provider({ rating_schemes: [schemeRow], evaluations: [evaluationRow] });
		expect(await ratingScheme.updateRatingScheme('scheme-a', { raterPersonId: '', notes: null })).toEqual({
			...scheme,
			raterPersonId: null,
			notes: null
		});
		expect(state.requests[0].body).toEqual({ rater_person_id: null, notes: null });
		expect(await ratingScheme.updateEvaluation('evaluation-a', { reportType: '' as never, notes: 'Next' })).toEqual({
			...evaluation,
			reportType: null,
			notes: 'Next'
		});
		expect(state.requests[1].body).toEqual({ report_type: null, notes: 'Next' });
		expect(await ratingScheme.updateEvaluation('missing', { notes: 'x' })).toBeNull();
		expect(tables.rating_schemes[0].archived_by).toBe('who-archived');
	});

	it('carries a scheme’s new type to its unfinished Evaluations and leaves completed ones as rated', async () => {
		const { ratingScheme, tables } = provider({
			rating_schemes: [schemeRow],
			evaluations: [
				evaluationRow,
				{ ...evaluationRow, id: 'untracked', workflow_status: null },
				{ ...evaluationRow, id: 'completed', workflow_status: 'completed' },
				{ ...evaluationRow, id: 'other-scheme', rating_scheme_id: 'scheme-b' }
			]
		});
		await ratingScheme.updateRatingScheme('scheme-a', { evalType: 'WOER' });
		expect(Object.fromEntries(tables.evaluations.map((row) => [row.id, row.eval_type]))).toEqual({
			'evaluation-a': 'WOER',
			untracked: 'WOER',
			completed: 'OER',
			'other-scheme': 'OER'
		});
	});

	it('deletes only this unit’s Evaluation and reports a failed delete', async () => {
		const foreign = { ...evaluationRow, organization_id: 'org-b' };
		const { ratingScheme, tables, state } = provider({ evaluations: [evaluationRow, foreign] });
		state.rejectMethod = 'DELETE';
		await expect(ratingScheme.deleteEvaluation('evaluation-a')).rejects.toThrow('Rating provider unavailable');
		state.rejectMethod = '';
		await ratingScheme.deleteEvaluation('evaluation-a');
		expect(tables.evaluations).toEqual([foreign]);
	});
});

describe('Rating Scheme lifecycle functions', () => {
	function lifecycleProvider(result: unknown) {
		const calls: Array<{ path: string; body: Row }> = [];
		const client = createClient('http://rating-ledger.invalid', 'ordinary-request-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					if (!url.pathname.startsWith('/rest/v1/rpc/')) throw new Error('Unexpected Rating provider operation');
					calls.push({ path: url.pathname.replace('/rest/v1/rpc/', ''), body: await request.json() });
					return Response.json(result);
				}
			}
		});
		return { calls, ratingScheme: createSupabaseRatingSchemePersistence(client, 'org-a') };
	}

	it('answers a move from the function result with no second read', async () => {
		const { calls, ratingScheme } = lifecycleProvider({ moved: false, evaluation: evaluationRow });
		expect(await ratingScheme.transitionEvaluation('evaluation-a', { from: 'with-rater', to: 'with-rater' })).toEqual({
			evaluation,
			moved: false
		});
		expect(calls).toEqual([
			{
				path: 'transition_evaluation',
				body: { p_organization_id: 'org-a', p_evaluation_id: 'evaluation-a', p_from: 'with-rater', p_to: 'with-rater' }
			}
		]);
	});

	it('answers an archive with the scheme and no who-archived', async () => {
		const archivedAt = '2026-10-07T09:00:00+00:00';
		const { calls, ratingScheme } = lifecycleProvider({
			changed: true,
			ratingScheme: { ...schemeRow, archived_by: undefined, archived_at: archivedAt }
		});
		expect(await ratingScheme.setRatingSchemeArchived('scheme-a', true)).toEqual({
			ratingScheme: { ...scheme, archivedAt },
			changed: true
		});
		expect(calls.map(({ path }) => path)).toEqual(['set_rating_scheme_archived']);
	});

	it('starts an Evaluation on a scheme and says whether it made a new one', async () => {
		const { calls, ratingScheme } = lifecycleProvider({ created: true, evaluation: evaluationRow });
		const start = {
			reportType: 'CR' as const,
			ratingPeriodStart: '2025-10-05',
			ratingPeriodEnd: '2026-10-04',
			completed: false,
			notes: null
		};
		expect(await ratingScheme.startEvaluation('scheme-a', start)).toEqual({ evaluation, created: true });
		expect(calls[0]).toMatchObject({
			path: 'start_evaluation',
			body: { p_rating_scheme_id: 'scheme-a', p_report_type: 'CR', p_completed: false }
		});
	});

	it('answers a change of rater with the closed Evaluation, the scheme and its successor', async () => {
		const completed = { ...evaluationRow, workflow_status: 'completed' };
		const successor = { ...evaluationRow, id: 'evaluation-b', workflow_status: 'drafting', report_type: 'AN' };
		const change = { changeDate: '2026-06-01', raterPersonId: 'rater-b', raterName: null };
		const open = lifecycleProvider({
			evaluation: completed,
			ratingScheme: { ...schemeRow, rater_person_id: 'rater-b' },
			successor
		});
		expect(await open.ratingScheme.changeEvaluationRater('evaluation-a', change)).toEqual({
			evaluation: { ...evaluation, workflowStatus: 'completed' },
			ratingScheme: { ...scheme, raterPersonId: 'rater-b' },
			successor: { ...evaluation, id: 'evaluation-b', workflowStatus: 'drafting', reportType: 'AN' }
		});
		expect(open.calls.map(({ path }) => path)).toEqual(['change_evaluation_rater']);

		const repeat = lifecycleProvider({ evaluation: completed, ratingScheme: schemeRow, successor: null });
		expect((await repeat.ratingScheme.changeEvaluationRater('evaluation-a', change)).successor).toBeNull();
	});

	it('turns a refused rule into the reason the person can act on', async () => {
		const client = createClient('http://rating-ledger.invalid', 'ordinary-request-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async () =>
					Response.json(
						{ code: '55000', message: 'Another evaluation is already open on this rating scheme' },
						{ status: 400 }
					)
			}
		});
		const ratingScheme = createSupabaseRatingSchemePersistence(client, 'org-a');
		const start = {
			reportType: null,
			ratingPeriodStart: '2026-01-01',
			ratingPeriodEnd: '2026-12-31',
			completed: false,
			notes: null
		};
		await expect(ratingScheme.startEvaluation('scheme-a', start)).rejects.toMatchObject({
			status: 409,
			message: 'Another evaluation is already open on this rating scheme'
		});
	});
});
