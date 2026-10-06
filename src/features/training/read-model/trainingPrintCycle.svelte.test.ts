// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TRAINING_BRIEFING_INPUT,
	type TrainingBriefingDetail,
	type TrainingBriefingReportData
} from '../contracts';
import { buildTrainingBriefing } from '../utils/trainingBriefing';
import { TrainingBriefingSession } from './trainingBriefingSession.svelte';
import { TrainingPrintCycle } from './trainingPrintCycle.svelte';

function report(groupId: string | null = null): TrainingBriefingReportData {
	return {
		input: { ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId },
		organizationName: 'Synthetic Company',
		filterOptions: { views: [], groups: [], ranks: [], mos: [], roles: [], types: [] },
		briefing: buildTrainingBriefing({
			personnel: [],
			types: [],
			records: [],
			filters: {},
			horizonDays: 90,
			asOf: '2026-10-05',
			goalPercent: 90,
			rowsBy: 'group',
			scopeName: groupId ?? 'Synthetic Company'
		})
	};
}

function detail(page = 1): TrainingBriefingDetail {
	return {
		scope: { kind: 'cell', rowKey: null, typeId: 'bls' },
		rows: [
			{
				personId: `person-${page}`,
				rank: 'PFC',
				name: `Synthetic ${page}`,
				groupName: 'Respiratory',
				typeId: 'bls',
				typeName: 'Basic Life Support',
				status: 'not-completed',
				label: 'Not recorded',
				expirationDate: null,
				lapseDate: null,
				lapsesInHorizon: false
			}
		],
		page,
		pageSize: 25,
		totalRows: 100,
		totalPages: 4
	};
}

function setup() {
	const requests: Array<(response: Response) => void> = [];
	const session = new TrainingBriefingSession({
		orgId: 'synthetic-org',
		initialReport: report(),
		replaceQuery: () => {},
		fetch: () => new Promise<Response>((resolve) => requests.push(resolve))
	});
	const cycle = new TrainingPrintCycle(() => ({
		report: session.report,
		detail: session.detail.status === 'idle' ? null : session.detail.detail
	}));
	return { session, cycle, requests };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Training print cycle', () => {
	it('captures the loaded input while a filter is pending and keeps it after the late response', async () => {
		const { session, cycle, requests } = setup();
		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'alpha' });
		cycle.capture();
		expect(cycle.data?.report.input.groupId).toBeNull();
		expect(cycle.data?.detail).toBeNull();
		requests[0](Response.json(report('alpha')));
		await settle();
		expect(session.report.input.groupId).toBe('alpha');
		cycle.capture();
		expect(cycle.data?.report.input.groupId).toBeNull();
		cycle.release();
		cycle.capture();
		expect(cycle.data?.report.input.groupId).toBe('alpha');
		expect(requests).toHaveLength(1);
	});

	it('prints only the loaded detail page when another page is pending or failed', async () => {
		const { session, cycle, requests } = setup();
		session.requestDetail(detail().scope);
		requests[0](Response.json(detail()));
		await settle();
		session.showDetailPage(2);
		cycle.capture();
		expect(cycle.data?.detail).toMatchObject({ page: 1, pageSize: 25, totalRows: 100 });
		requests[1](new Response(null, { status: 503 }));
		await settle();
		cycle.release();
		cycle.capture();
		expect(cycle.data?.detail?.rows[0].name).toBe('Synthetic 1');
		expect(cycle.data?.detail?.page).toBe(1);
		expect(requests).toHaveLength(2);
	});

	it('keeps the captured page when a later detail response replaces the screen page', async () => {
		const { session, cycle, requests } = setup();
		session.requestDetail(detail().scope);
		requests[0](Response.json(detail()));
		await settle();
		session.showDetailPage(2);
		cycle.capture();
		requests[1](Response.json(detail(2)));
		await settle();
		expect(cycle.data?.detail?.page).toBe(1);
		cycle.release();
		cycle.capture();
		expect(cycle.data?.detail?.page).toBe(2);
		expect(cycle.data?.detail?.rows[0].name).toBe('Synthetic 2');
	});

	it('keeps loaded report and detail when the attempted filter fails', async () => {
		const { session, cycle, requests } = setup();
		session.requestDetail(detail().scope);
		requests[0](Response.json(detail()));
		await settle();
		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'alpha' });
		requests[1](new Response(null, { status: 503 }));
		await settle();
		cycle.capture();
		expect(cycle.data?.report.input.groupId).toBeNull();
		expect(cycle.data?.detail?.totalRows).toBe(100);
	});

	it('keeps the report and detail together when a new report clears the screen detail', async () => {
		const { session, cycle, requests } = setup();
		session.requestDetail(detail().scope);
		requests[0](Response.json(detail()));
		await settle();
		cycle.capture();
		session.select({ ...DEFAULT_TRAINING_BRIEFING_INPUT, groupId: 'alpha' });
		requests[1](Response.json(report('alpha')));
		await settle();
		expect(session.detail.status).toBe('idle');
		expect(cycle.data?.report.input.groupId).toBeNull();
		expect(cycle.data?.detail?.totalRows).toBe(100);
		cycle.release();
		cycle.capture();
		expect(cycle.data?.report.input.groupId).toBe('alpha');
		expect(cycle.data?.detail).toBeNull();
	});

	it('omits an unfulfilled new scope instead of disclosing the previous scope', async () => {
		const { session, cycle, requests } = setup();
		session.requestDetail(detail().scope);
		requests[0](Response.json(detail()));
		await settle();
		session.requestDetail({ kind: 'cell', rowKey: 'another-group', typeId: 'bls' });
		cycle.capture();
		expect(cycle.data?.detail).toBeNull();
		requests[1](new Response(null, { status: 503 }));
		await settle();
		cycle.release();
		cycle.capture();
		expect(cycle.data?.detail).toBeNull();
	});

	it('releases a cancelled native cycle and handles a synchronous print event cycle', () => {
		const { session, cycle, requests } = setup();
		cycle.capture();
		cycle.release();
		cycle.release();
		session.report = report('bravo');
		let printedGroup: string | null | undefined;
		cycle.print(() => {
			printedGroup = cycle.data?.report.input.groupId;
			cycle.capture();
			cycle.print(() => {
				throw new Error('Repeated print must not reopen the dialog.');
			});
			cycle.release();
		});
		expect(printedGroup).toBe('bravo');
		expect(cycle.data).toBeNull();
		expect(requests).toEqual([]);
	});

	it('releases capture when native printing throws and allows retry', () => {
		const { cycle } = setup();
		expect(() =>
			cycle.print(() => {
				throw new Error('Native printing unavailable');
			})
		).toThrow('Native printing unavailable');
		expect(cycle.data).toBeNull();
		let organization: string | undefined;
		cycle.print(() => {
			organization = cycle.data?.report.organizationName;
		});
		expect(organization).toBe('Synthetic Company');
		expect(cycle.data?.report.organizationName).toBe('Synthetic Company');
	});

	it('keeps an asynchronous native dialog frozen after print returns until an exit event', () => {
		const { session, cycle } = setup();
		cycle.print(() => cycle.capture());
		session.report = report('bravo');
		cycle.capture();
		expect(cycle.data?.report.input.groupId).toBeNull();
		cycle.release();
		cycle.print(() => cycle.capture());
		expect(cycle.data?.report.input.groupId).toBe('bravo');
	});

	it('discards capture on page disposal and ignores later native events or print calls', () => {
		const { cycle } = setup();
		cycle.capture();
		cycle.dispose();
		cycle.capture();
		cycle.print(() => {
			throw new Error('Disposed pages must not print.');
		});
		expect(cycle.data).toBeNull();
	});
});
