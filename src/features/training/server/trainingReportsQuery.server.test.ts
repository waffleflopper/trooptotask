import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import {
	createInMemoryDataStore,
	createQueryPortsContext,
	createQueryWithRawStorePortsContext
} from '$features/training/server/trainingPersistence.test-support.server';
import { DEFAULT_TRAINING_BRIEFING_INPUT, type TrainingBriefingReportInput } from '$features/training/contracts';
import {
	fetchTrainingBriefingDetail,
	fetchTrainingBriefingReport,
	generateTrainingReportWorkbookExport
} from './trainingReportsQuery.server';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];
type Store = ReturnType<typeof createInMemoryDataStore>;

const ORG = 'test-org';
const NO_CAPABILITIES = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

function input(overrides: Partial<TrainingBriefingReportInput> = {}): TrainingBriefingReportInput {
	return { ...DEFAULT_TRAINING_BRIEFING_INPUT, ...overrides };
}

function person(id: string, lastName: string, rank: string, mos: string, role: string, group: 'alpha' | 'bravo') {
	return {
		id,
		organization_id: ORG,
		rank,
		last_name: lastName,
		first_name: 'Pat',
		mos,
		clinic_role: role,
		group_id: group,
		archived_at: null,
		groups: { name: group === 'alpha' ? 'Alpha' : 'Bravo' }
	};
}

function trainingType(id: string, name: string, sortOrder: number, overrides: Record<string, unknown> = {}) {
	return {
		id,
		organization_id: ORG,
		name,
		description: 'Internal guidance',
		expiration_months: 12,
		warning_days_yellow: 60,
		warning_days_orange: 30,
		applies_to_roles: [],
		applies_to_mos: [],
		applies_to_ranks: [],
		excluded_roles: [],
		excluded_mos: [],
		excluded_ranks: [],
		color: '#22c55e',
		sort_order: sortOrder,
		expiration_date_only: false,
		can_be_exempted: true,
		exempt_personnel_ids: ['p-hidden'],
		is_optional: false,
		...overrides
	};
}

function completion(personId: string, typeId: string, expirationDate: string) {
	return {
		id: `pt-${personId}-${typeId}`,
		organization_id: ORG,
		personnel_id: personId,
		training_type_id: typeId,
		completion_date: '2025-06-01',
		expiration_date: expirationDate,
		notes: 'private note',
		certificate_url: null
	};
}

function seedUnit(store: Store) {
	store.seed('organizations', [{ id: ORG, name: 'Test Company', training_readiness_goal_percent: 80 }]);
	store.seed('groups', [
		{ id: 'alpha', organization_id: ORG, name: 'Alpha', sort_order: 0 },
		{ id: 'bravo', organization_id: ORG, name: 'Bravo', sort_order: 1 }
	]);
	store.seed('personnel', [
		person('p-able', 'Able', 'SGT', '68W', 'Medic', 'alpha'),
		person('p-baker', 'Baker', 'SPC', '11B', 'Line', 'bravo'),
		person('p-cole', 'Cole', 'SPC', '68W', 'Line', 'alpha')
	]);
	store.seed('training_types', [
		trainingType('cpr', 'CPR', 0),
		trainingType('bls', 'BLS', 1),
		trainingType('opt', 'Optional', 2, { is_optional: true })
	]);
	store.seed('training_views', [
		{ id: 'medical', organization_id: ORG, name: 'Medical', column_ids: ['bls', 'cpr', 'opt'] }
	]);
	store.seed('personnel_trainings', [
		completion('p-able', 'cpr', '2027-06-01'),
		completion('p-able', 'bls', '2026-10-10'),
		completion('p-baker', 'cpr', '2026-01-01'),
		completion('p-cole', 'cpr', '2026-11-15'),
		completion('p-cole', 'bls', '2027-06-01')
	]);
}

function unitContext() {
	const ctx = createQueryPortsContext();
	seedUnit(ctx.store as Store);
	return ctx;
}

describe('Training briefing report', () => {
	it('briefs the whole authorized roster against the Organization goal and offers only display options', async () => {
		const report = await fetchTrainingBriefingReport(unitContext(), input());

		expect(report.input).toEqual(DEFAULT_TRAINING_BRIEFING_INPUT);
		expect(report.organizationName).toBe('Test Company');
		expect(report.briefing.bottomLine).toMatchObject({
			scopeName: 'Test Company',
			soldierCount: 3,
			asOf: '2026-09-29',
			horizonEnd: '2026-12-28',
			today: { ready: 4, applicable: 6, percent: 67, band: 'below' },
			horizon: { ready: 2, applicable: 6, percent: 33, band: 'critical' },
			expired: 1,
			notRecorded: 1,
			lapsing: 2
		});
		expect(report.briefing.forecast.goalPercent).toBe(80);
		expect(report.briefing.grid.columns).toEqual([
			{ typeId: 'cpr', name: 'CPR' },
			{ typeId: 'bls', name: 'BLS' }
		]);
		expect(report.filterOptions).toEqual({
			views: [{ id: 'medical', name: 'Medical' }],
			groups: [
				{ id: 'alpha', name: 'Alpha' },
				{ id: 'bravo', name: 'Bravo' }
			],
			ranks: ['SGT', 'SPC'],
			mos: ['11B', '68W'],
			roles: ['Line', 'Medic'],
			types: [
				{ id: 'cpr', name: 'CPR' },
				{ id: 'bls', name: 'BLS' }
			]
		});
		const body = JSON.stringify(report);
		for (const leaked of ['pt-p-able-cpr', 'private note', 'Internal guidance', 'p-hidden', 'p-baker']) {
			expect(body).not.toContain(leaked);
		}
	});

	it('orders columns by the saved view, intersects selected types and drops each unknown value independently', async () => {
		const report = await fetchTrainingBriefingReport(
			unitContext(),
			input({
				viewId: 'medical',
				groupId: 'ghost',
				rank: 'COL',
				mos: ['68W', 'ZZZ'],
				roles: ['Nobody'],
				typeIds: ['cpr', 'opt', 'ghost'],
				horizonDays: 30,
				rowsBy: 'mos'
			})
		);

		expect(report.input).toEqual({
			viewId: 'medical',
			groupId: null,
			rank: null,
			mos: ['68W'],
			roles: [],
			typeIds: ['cpr'],
			horizonDays: 30,
			rowsBy: 'mos'
		});
		expect(report.filterOptions.types).toEqual([
			{ id: 'bls', name: 'BLS' },
			{ id: 'cpr', name: 'CPR' }
		]);
		expect(report.briefing.grid.columns).toEqual([{ typeId: 'cpr', name: 'CPR' }]);
		expect(report.briefing.grid.rows.map((row) => [row.key, row.soldierCount, row.today.percent])).toEqual([
			['68W', 2, 100]
		]);
		expect(report.briefing.bottomLine.horizonEnd).toBe('2026-10-29');
	});

	it('names the selected group as the briefing scope', async () => {
		const report = await fetchTrainingBriefingReport(unitContext(), input({ groupId: 'alpha', rank: 'SPC' }));

		expect(report.input).toMatchObject({ groupId: 'alpha', rank: 'SPC' });
		expect(report.briefing.bottomLine).toMatchObject({ scopeName: 'Alpha', soldierCount: 1 });
		expect(report.organizationName).toBe('Test Company');
	});

	it('briefs only the scoped roster of a Training-only member and cannot open a hidden row', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['alpha'] },
				capabilityMap: { ...NO_CAPABILITIES, training: 'view' }
			}
		});
		seedUnit(ctx.rawStore as Store);
		const scopedRoster = await ctx.personnelTrainingRoster!.listActiveForReports(ctx.auth);
		ctx.personnelTrainingRoster = { ...ctx.personnelTrainingRoster!, listActiveForReports: async () => scopedRoster };
		const rawFindMany = ctx.rawStore.findMany.bind(ctx.rawStore);
		ctx.rawStore.findMany = ((table, orgId, filters, options) => {
			if (table === 'personnel') throw new Error('Personnel SELECT denied for this Training-only actor');
			return rawFindMany(table, orgId, filters, options);
		}) as typeof ctx.rawStore.findMany;

		const report = await fetchTrainingBriefingReport(ctx, input());

		expect(report.briefing.bottomLine.soldierCount).toBe(2);
		expect(report.briefing.grid.rows.map((row) => row.key)).toEqual(['alpha']);
		expect(report.filterOptions.mos).toEqual(['68W']);
		await expect(
			fetchTrainingBriefingDetail(ctx, {
				report: input(),
				scope: { kind: 'cell', rowKey: 'bravo', typeId: 'cpr' },
				page: 1,
				pageSize: 25
			})
		).rejects.toMatchObject({ status: 404 });
	});

	it('denies the briefing, its detail and its export without Training view', async () => {
		const ctx = createQueryPortsContext({
			auth: { role: 'member', isPrivileged: false, capabilityMap: NO_CAPABILITIES }
		});
		seedUnit(ctx.store as Store);
		const detail = { report: input(), scope: { kind: 'focus' as const, key: 'wave' }, page: 1, pageSize: 25 };

		await expect(fetchTrainingBriefingReport(ctx, input())).rejects.toMatchObject({ status: 403 });
		await expect(fetchTrainingBriefingDetail(ctx, detail)).rejects.toMatchObject({ status: 403 });
		await expect(generateTrainingReportWorkbookExport(ctx, input())).rejects.toMatchObject({ status: 403 });
	});

	it('refuses to brief an Organization it cannot read', async () => {
		const ctx = createQueryPortsContext();
		await expect(fetchTrainingBriefingReport(ctx, input())).rejects.toMatchObject({ status: 404 });
	});
});

describe('Training briefing detail', () => {
	it('pages the affected requirements of a Total cell, clamping past the last page and joining display labels', async () => {
		const detail = await fetchTrainingBriefingDetail(unitContext(), {
			report: input(),
			scope: { kind: 'cell', rowKey: null, typeId: 'cpr' },
			page: 9,
			pageSize: 1
		});

		expect(detail).toEqual({
			scope: { kind: 'cell', rowKey: null, typeId: 'cpr' },
			rows: [
				{
					personId: 'p-cole',
					rank: 'SPC',
					name: 'Cole, Pat',
					groupName: 'Alpha',
					typeId: 'cpr',
					typeName: 'CPR',
					status: 'warning-yellow',
					label: '47d left',
					expirationDate: '2026-11-15',
					lapseDate: '2026-11-16',
					lapsesInHorizon: true
				}
			],
			totalRows: 2,
			page: 2,
			pageSize: 1,
			totalPages: 2
		});
	});

	it('lists a row cell under the same filters the page shows', async () => {
		const detail = await fetchTrainingBriefingDetail(unitContext(), {
			report: input({ viewId: 'medical' }),
			scope: { kind: 'cell', rowKey: 'bravo', typeId: 'bls' },
			page: 1,
			pageSize: 25
		});

		expect(detail.rows.map((row) => [row.name, row.typeName, row.label, row.expirationDate])).toEqual([
			['Baker, Pat', 'BLS', 'Not Done', null]
		]);
		expect(detail.totalPages).toBe(1);
	});

	it('rejects a row, type or focus area the current filters do not produce', async () => {
		const ctx = unitContext();
		const request = (scope: Parameters<typeof fetchTrainingBriefingDetail>[1]['scope'], report = input()) =>
			fetchTrainingBriefingDetail(ctx, { report, scope, page: 1, pageSize: 25 });

		await expect(request({ kind: 'cell', rowKey: 'ghost', typeId: 'cpr' })).rejects.toMatchObject({ status: 404 });
		await expect(request({ kind: 'cell', rowKey: null, typeId: 'opt' })).rejects.toMatchObject({ status: 404 });
		await expect(
			request({ kind: 'cell', rowKey: 'bravo', typeId: 'cpr' }, input({ groupId: 'alpha' }))
		).rejects.toMatchObject({ status: 404 });
		await expect(request({ kind: 'focus', key: 'gap:ghost' })).rejects.toMatchObject({ status: 404 });
	});
});

async function exportedWorkbook(ctx: ReturnType<typeof unitContext>, request: TrainingBriefingReportInput) {
	const exported = await generateTrainingReportWorkbookExport(ctx, request);
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(exported.buffer as WorkbookLoadBuffer);
	return { exported, workbook };
}

function sheetRows(workbook: ExcelJS.Workbook, name: string): unknown[][] {
	return workbook
		.getWorksheet(name)!
		.getSheetValues()
		.slice(1)
		.map((row) => (row as unknown[]).slice(1));
}

describe('Training report workbook', () => {
	it('exports the briefing on screen as five sheets with every affected requirement in drill-down order', async () => {
		const { exported, workbook } = await exportedWorkbook(unitContext(), input());

		expect(exported.filename).toBe('training-report-2026-09-29.xlsx');
		expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
			'Summary',
			'Forecast',
			'Hot spots',
			'Focus',
			'Requirements'
		]);
		expect(sheetRows(workbook, 'Summary')).toEqual([
			['Item', 'Value'],
			['Organization', 'Test Company'],
			['Scope', 'Test Company'],
			['Soldiers', 3],
			['As of', '2026-09-29'],
			['Horizon end', '2026-12-28'],
			['Readiness goal (%)', 80],
			['Ready today (%)', 67],
			['Ready by 28 Dec (%)', 33],
			['Drop (points)', 33],
			['Ready', 4],
			['Applicable requirements', 6],
			['Not ready, expired', 1],
			['Not ready, not recorded', 1],
			['Lapse by 28 Dec', 2],
			['Bottom line', 'If no one renews, Test Company loses 33 points in 90 days.'],
			['Filter: View', 'All training'],
			['Filter: Group', 'All groups'],
			['Filter: Rank', 'All ranks'],
			['Filter: MOS', 'All'],
			['Filter: Duty role', 'All'],
			['Filter: Types', 'All required (2)'],
			['Filter: Horizon', '90 days'],
			['Filter: Rows by', 'Group']
		]);

		const forecast = sheetRows(workbook, 'Forecast');
		expect(forecast).toHaveLength(15);
		expect(forecast.slice(0, 4)).toEqual([
			['Date', 'Ready', 'Ready (%)', 'Week', 'Lapses', 'Cliff window'],
			['2026-09-29', 4, 67],
			['2026-10-06', 4, 67, '30 Sep – 6 Oct', 0, 'No'],
			['2026-10-13', 3, 50, '7 Oct – 13 Oct', 1, 'No']
		]);
		expect(forecast[8]).toEqual(['2026-11-17', 2, 33, '11 Nov – 17 Nov', 1, 'No']);
		expect(forecast[14]).toEqual(['2026-12-28', 2, 33, '23 Dec – 28 Dec', 0, 'No']);

		expect(sheetRows(workbook, 'Hot spots')).toEqual([
			[
				'Group',
				'Soldiers',
				'CPR today (%)',
				'CPR drop',
				'BLS today (%)',
				'BLS drop',
				'Today (%)',
				'28 Dec (%)',
				'Drop'
			],
			['Bravo', 1, 0, 0, 0, 0, 0, 0, 0],
			['Alpha', 2, 100, 50, 100, 50, 100, 50, 50],
			['Total', 3, 67, 33, 67, 33, 67, 33, 33]
		]);

		expect(sheetRows(workbook, 'Focus')).toEqual([
			[
				'#',
				'Title',
				'Body',
				'What if',
				'Forecast before (%)',
				'Forecast after (%)',
				'Soldiers',
				'Requirements',
				'First lapse'
			],
			[
				1,
				'BLS — the standing gap',
				'1 soldier is already not ready, 33% of Test Company. Bravo holds more than half of them.',
				'ALL RENEWED · 28 Dec forecast 33% → 67%',
				33,
				67,
				2,
				2
			],
			[
				2,
				'CPR — the standing gap',
				'1 soldier is already not ready, 33% of Test Company. Bravo holds more than half of them.',
				'ALL RENEWED · 28 Dec forecast 33% → 67%',
				33,
				67,
				2,
				2
			]
		]);

		expect(sheetRows(workbook, 'Requirements')).toEqual([
			['Rank', 'Name', 'Group', 'Training type', 'Status today', 'Expiration date', 'Lapse date', 'Lapses in horizon'],
			['SPC', 'Baker, Pat', 'Bravo', 'BLS', 'Not Done', undefined, undefined, 'No'],
			['SPC', 'Baker, Pat', 'Bravo', 'CPR', 'Expired 271d ago', '2026-01-01', undefined, 'No'],
			['SGT', 'Able, Pat', 'Alpha', 'BLS', '11d left', '2026-10-10', '2026-10-11', 'Yes'],
			['SPC', 'Cole, Pat', 'Alpha', 'CPR', '47d left', '2026-11-15', '2026-11-16', 'Yes']
		]);
	});

	it('narrows every sheet to the filters but never to the drill-down on screen', async () => {
		const ctx = unitContext();
		const alpha = input({ groupId: 'alpha' });
		const drillDown = await fetchTrainingBriefingDetail(ctx, {
			report: alpha,
			scope: { kind: 'cell', rowKey: null, typeId: 'cpr' },
			page: 1,
			pageSize: 25
		});
		const { workbook } = await exportedWorkbook(ctx, alpha);

		expect(drillDown.rows.map((row) => row.name)).toEqual(['Cole, Pat']);
		expect(sheetRows(workbook, 'Summary')).toEqual(
			expect.arrayContaining([
				['Scope', 'Alpha'],
				['Applicable requirements', 4],
				['Filter: Group', 'Alpha']
			])
		);
		expect(
			sheetRows(workbook, 'Requirements')
				.slice(1)
				.map((row) => [row[1], row[3]])
		).toEqual([
			['Able, Pat', 'BLS'],
			['Cole, Pat', 'CPR']
		]);
	});

	it('lists more affected requirements than one detail page holds', async () => {
		const ctx = unitContext();
		(ctx.store as Store).seed(
			'personnel',
			Array.from({ length: 13 }, (_, index) => person(`p-new-${index}`, `New${index}`, 'PVT', '11B', 'Line', 'bravo'))
		);
		const { workbook } = await exportedWorkbook(ctx, input());
		const requirements = sheetRows(workbook, 'Requirements').slice(1);

		expect(requirements).toHaveLength(30);
		expect(requirements.slice(-2).map((row) => [row[1], row[3]])).toEqual([
			['Able, Pat', 'BLS'],
			['Cole, Pat', 'CPR']
		]);
	});

	it('keeps user-defined names that look like formulas as text', async () => {
		const ctx = unitContext();
		(ctx.store as Store).seed('training_types', [trainingType('formula', '=HYPERLINK("http://x","CPR")', 3)]);
		const { workbook } = await exportedWorkbook(ctx, input({ typeIds: ['formula'] }));
		const typeCell = workbook.getWorksheet('Requirements')!.getCell('D2');

		expect(typeCell.type).toBe(ExcelJS.ValueType.String);
		expect(typeCell.value).toBe('=HYPERLINK("http://x","CPR")');
		expect(sheetRows(workbook, 'Summary')).toContainEqual(['Filter: Types', '=HYPERLINK("http://x","CPR")']);
	});
});
