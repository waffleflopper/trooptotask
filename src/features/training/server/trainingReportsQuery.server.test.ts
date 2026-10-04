import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import {
	createInMemoryDataStore,
	createQueryPortsContext,
	createQueryWithRawStorePortsContext
} from '$lib/server/adapters/inMemory';
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

describe('Training report workbook', () => {
	it('exports exactly the filtered population and view columns the briefing shows', async () => {
		const exported = await generateTrainingReportWorkbookExport(
			unitContext(),
			input({ viewId: 'medical', groupId: 'alpha', typeIds: [] })
		);
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(exported.buffer as WorkbookLoadBuffer);
		const sheet = workbook.getWorksheet('Training Report')!;

		expect(exported.filename).toBe('training-report-2026-09-29.xlsx');
		expect(sheet.getSheetValues().slice(1)).toEqual([
			[undefined, 'Name', 'Rank', 'MOS', 'Duty Role', 'Group', 'BLS', 'CPR'],
			[undefined, 'Able, Pat', 'SGT', '68W', 'Medic', 'Alpha', '11d left (2026-10-10)', 'Current (2027-06-01)'],
			[undefined, 'Cole, Pat', 'SPC', '68W', 'Line', 'Alpha', 'Current (2027-06-01)', '47d left (2026-11-15)']
		]);
	});
});
