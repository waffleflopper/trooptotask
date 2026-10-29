import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TRAINING_BRIEFING_INPUT,
	type TrainingBriefingDetail,
	type TrainingBriefingReportData,
	type TrainingBriefingReportInput
} from '../contracts';
import { buildTrainingBriefing } from '../utils/trainingBriefing';
import { TrainingBriefingSession } from './trainingBriefingSession.svelte';

function reportFor(
	input: Partial<TrainingBriefingReportInput> = {},
	scopeName = 'Test Company'
): TrainingBriefingReportData {
	return {
		input: { ...DEFAULT_TRAINING_BRIEFING_INPUT, ...input },
		organizationName: 'Test Company',
		briefing: buildTrainingBriefing({
			personnel: [],
			groups: [],
			types: [],
			records: [],
			filters: {},
			horizonDays: 90,
			asOf: '2026-09-29',
			goalPercent: 90,
			rowsBy: 'group',
			scopeName
		}),
		filterOptions: { views: [], groups: [], ranks: [], mos: [], roles: [], types: [] }
	};
}

function controlledFetch() {
	const calls: Array<{ url: string; signal: AbortSignal; respond: (response: Response) => void }> = [];
	const fetch = ((url: string, init: RequestInit) =>
		new Promise<Response>((respond) => {
			calls.push({ url, signal: init.signal as AbortSignal, respond });
		})) as unknown as typeof globalThis.fetch;
	return { calls, fetch };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
	const transport = controlledFetch();
	const queries: string[] = [];
	const session = new TrainingBriefingSession({
		orgId: 'org-1',
		initialReport: reportFor(),
		fetch: transport.fetch,
		replaceQuery: (query) => queries.push(query)
	});
	return { session, queries, calls: transport.calls };
}

describe('Training briefing session', () => {
	it('starts from the server briefing without requesting it again', () => {
		const { session, calls, queries } = setup();

		expect(session.report.briefing.bottomLine.scopeName).toBe('Test Company');
		expect(session.request).toEqual({ status: 'ready' });
		expect(calls).toEqual([]);
		expect(queries).toEqual([]);
	});

	it('requests the selected filters and shows the canonical briefing and URL the server returns', async () => {
		const { session, calls, queries } = setup();

		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'alpha', mos: ['68W'] });
		expect(session.request.status).toBe('loading');
		expect(session.selected.groupId).toBe('alpha');
		expect(calls[0].url).toBe('/org/org-1/api/training-reports?group=alpha&mos=68W');

		calls[0].respond(Response.json(reportFor({ groupId: 'alpha' }, 'Alpha')));
		await flush();

		expect(session.report.briefing.bottomLine.scopeName).toBe('Alpha');
		expect(session.selected).toEqual({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'alpha' });
		expect(session.request).toEqual({ status: 'ready' });
		expect(queries).toEqual(['group=alpha']);
	});

	it('aborts a superseded request and ignores its late answer even when the transport ignores the abort', async () => {
		const { session, calls } = setup();

		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'alpha' });
		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'bravo' });
		expect(calls[0].signal.aborted).toBe(true);

		calls[1].respond(Response.json(reportFor({ groupId: 'bravo' }, 'Bravo')));
		await flush();
		calls[0].respond(Response.json(reportFor({ groupId: 'alpha' }, 'Alpha')));
		await flush();

		expect(session.report.briefing.bottomLine.scopeName).toBe('Bravo');
		expect(session.selected.groupId).toBe('bravo');
	});

	it('returns the controls to the briefing on screen when a refresh fails, and retries the attempted filters', async () => {
		const { session, calls } = setup();

		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'alpha' });
		calls[0].respond(new Response(null, { status: 503 }));
		await flush();

		expect(session.selected).toEqual(DEFAULT_TRAINING_BRIEFING_INPUT);
		expect(session.report.briefing.bottomLine.scopeName).toBe('Test Company');
		expect(session.request).toMatchObject({ status: 'error', input: { groupId: 'alpha' } });

		session.retry();
		expect(calls[1].url).toBe('/org/org-1/api/training-reports?group=alpha');
		calls[1].respond(Response.json(reportFor({ groupId: 'alpha' }, 'Alpha')));
		await flush();

		expect(session.report.briefing.bottomLine.scopeName).toBe('Alpha');
		expect(session.request).toEqual({ status: 'ready' });
	});

	it('reads a revisited filter again instead of reusing its earlier answer', async () => {
		const { session, calls } = setup();

		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'alpha' });
		calls[0].respond(Response.json(reportFor({ groupId: 'alpha' }, 'Alpha')));
		await flush();
		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'bravo' });
		calls[1].respond(Response.json(reportFor({ groupId: 'bravo' }, 'Bravo')));
		await flush();
		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'alpha' });

		expect(calls[2].url).toBe('/org/org-1/api/training-reports?group=alpha');
		calls[2].respond(Response.json(reportFor({ groupId: 'alpha' }, 'Alpha after new records')));
		await flush();

		expect(session.report.briefing.bottomLine.scopeName).toBe('Alpha after new records');
	});

	it('clears a failure by returning to the briefing on screen, without another request', async () => {
		const { session, calls, queries } = setup();

		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, horizonDays: 30 });
		calls[0].respond(new Response(null, { status: 500 }));
		await flush();
		session.select(DEFAULT_TRAINING_BRIEFING_INPUT);

		expect(calls).toHaveLength(1);
		expect(session.request).toEqual({ status: 'ready' });
		expect(queries).toEqual(['']);
	});

	it('stops writing after disposal', async () => {
		const { session, calls } = setup();

		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'alpha' });
		session.dispose();
		calls[0].respond(Response.json(reportFor({ groupId: 'alpha' }, 'Alpha')));
		await flush();

		expect(calls[0].signal.aborted).toBe(true);
		expect(session.report.briefing.bottomLine.scopeName).toBe('Test Company');
	});

	it('requests the detail of a cell under the briefing on screen and drops it when the briefing changes', async () => {
		const { session, calls } = setup();
		const detail: TrainingBriefingDetail = {
			scope: { kind: 'cell', rowKey: null, typeId: 'cpr' },
			rows: [],
			totalRows: 4,
			page: 1,
			pageSize: 25,
			totalPages: 1
		};

		session.requestDetail({ kind: 'cell', rowKey: null, typeId: 'cpr' });
		expect(calls[0].url).toBe('/org/org-1/api/training-reports/detail?scope=cell&type=cpr');
		calls[0].respond(Response.json(detail));
		await flush();
		expect(session.detail).toEqual({
			status: 'loaded',
			request: { scope: detail.scope, page: 1, pageSize: 25 },
			detail
		});

		session.requestDetail({ kind: 'cell', rowKey: 'alpha', typeId: 'cpr' });
		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, rowsBy: 'mos' });
		calls[2].respond(Response.json(reportFor({ rowsBy: 'mos' })));
		await flush();
		calls[1].respond(Response.json(detail));
		await flush();

		expect(calls[1].signal.aborted).toBe(true);
		expect(session.detail).toEqual({ status: 'idle' });
	});

	it('reports a failed detail request and retries the same scope', async () => {
		const { session, calls } = setup();

		session.requestDetail({ kind: 'cell', rowKey: 'alpha', typeId: 'cpr' });
		calls[0].respond(new Response(null, { status: 404 }));
		await flush();
		expect(session.detail).toMatchObject({ status: 'error', request: { scope: { rowKey: 'alpha' } }, detail: null });

		session.retryDetail();
		expect(calls[1].url).toBe('/org/org-1/api/training-reports/detail?scope=cell&row=alpha&type=cpr');
	});

	it('keeps the page on screen while another page of the same scope loads or fails, then retries the attempted page', async () => {
		const { session, calls } = setup();
		const scope = { kind: 'focus' as const, key: 'wave' };
		const firstPage = detailPage(scope, 1, 25);

		session.requestDetail(scope);
		calls[0].respond(Response.json(firstPage));
		await flush();
		session.showDetailPage(2);

		expect(calls[1].url).toBe('/org/org-1/api/training-reports/detail?scope=focus&focus=wave&page=2');
		expect(session.detail).toEqual({
			status: 'loading',
			request: { scope, page: 2, pageSize: 25 },
			detail: firstPage
		});

		calls[1].respond(new Response(null, { status: 503 }));
		await flush();
		expect(session.detail).toMatchObject({ status: 'error', request: { page: 2 }, detail: { page: 1 } });

		session.retryDetail();
		expect(calls[2].url).toBe('/org/org-1/api/training-reports/detail?scope=focus&focus=wave&page=2');
		calls[2].respond(Response.json(detailPage(scope, 2, 25)));
		await flush();
		expect(session.detail).toMatchObject({ status: 'loaded', detail: { page: 2 } });
	});

	it('returns to the first page when the page size changes and keeps that size for the next scope', () => {
		const { session, calls } = setup();

		session.requestDetail({ kind: 'cell', rowKey: null, typeId: 'cpr' });
		session.showDetailPage(3);
		session.setDetailPageSize(100);
		session.requestDetail({ kind: 'cell', rowKey: 'alpha', typeId: 'bls' });

		expect(calls.map((call) => call.url)).toEqual([
			'/org/org-1/api/training-reports/detail?scope=cell&type=cpr',
			'/org/org-1/api/training-reports/detail?scope=cell&type=cpr&page=3',
			'/org/org-1/api/training-reports/detail?scope=cell&type=cpr&pageSize=100',
			'/org/org-1/api/training-reports/detail?scope=cell&row=alpha&type=bls&pageSize=100'
		]);
		expect(calls.slice(0, 3).every((call) => call.signal.aborted)).toBe(true);
	});

	it('ignores a late answer for a page the user has moved past', async () => {
		const { session, calls } = setup();
		const scope = { kind: 'cell' as const, rowKey: null, typeId: 'cpr' };

		session.requestDetail(scope);
		session.showDetailPage(2);
		calls[1].respond(Response.json(detailPage(scope, 2, 25)));
		await flush();
		calls[0].respond(Response.json(detailPage(scope, 1, 25)));
		await flush();

		expect(session.detail).toMatchObject({ status: 'loaded', request: { page: 2 }, detail: { page: 2 } });
	});
});

function detailPage(scope: TrainingBriefingDetail['scope'], page: number, pageSize: number): TrainingBriefingDetail {
	return { scope, rows: [], totalRows: 60, page, pageSize, totalPages: 3 };
}
