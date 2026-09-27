import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
	createInMemoryDataStore,
	createQueryPortsContext,
	createQueryWithRawStorePortsContext
} from '$lib/server/adapters/inMemory';
import {
	fetchTrainingReportDetailPage,
	fetchTrainingReportPage,
	generateTrainingReportWorkbookExport
} from './trainingReportsQuery';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

const ORG = 'test-org';

function buildCtx() {
	return createQueryPortsContext();
}

describe('Training report projections', () => {
	it('returns a filtered, sorted, paginated report page with server-computed cells and dashboard counts', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('groups', [
			{ id: 'group-1', organization_id: ORG, name: 'Alpha', sort_order: 0 },
			{ id: 'group-2', organization_id: ORG, name: 'Bravo', sort_order: 1 }
		]);
		store.seed('personnel', [
			{
				id: 'p-smith',
				organization_id: ORG,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-1',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-adams',
				organization_id: ORG,
				rank: 'SPC',
				last_name: 'Adams',
				first_name: 'John',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-1',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-bravo',
				organization_id: ORG,
				rank: 'PFC',
				last_name: 'Brown',
				first_name: 'Bailey',
				mos: '11B',
				clinic_role: 'Line',
				group_id: 'group-2',
				archived_at: null,
				groups: { name: 'Bravo' }
			}
		]);
		store.seed('organization_rank_catalog', [
			rankCatalogRow({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy', pay_grade: 'E-5' }),
			rankCatalogRow({ code: 'SSgt', label: 'Staff Sergeant', service: 'air-force', pay_grade: 'E-5' }),
			rankCatalogRow({ code: 'SP4', label: 'Specialist Four', state: 'retired', pay_grade: 'E-4' })
		]);
		store.seed('training_types', [
			{
				id: 'type-cpr',
				organization_id: ORG,
				name: 'CPR',
				description: null,
				expiration_months: null,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#22c55e',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			}
		]);
		store.seed('personnel_trainings', [
			{
				id: 'pt-adams-cpr',
				organization_id: ORG,
				personnel_id: 'p-adams',
				training_type_id: 'type-cpr',
				completion_date: '2026-01-01',
				expiration_date: null,
				notes: null,
				certificate_url: null
			},
			{
				id: 'pt-bravo-cpr',
				organization_id: ORG,
				personnel_id: 'p-bravo',
				training_type_id: 'type-cpr',
				completion_date: '2026-01-01',
				expiration_date: null,
				notes: null,
				certificate_url: null
			}
		]);

		const result = await fetchTrainingReportPage(ctx, {
			filters: { groupId: 'group-1' },
			sort: { column: 'name', direction: 'asc' },
			pagination: { page: 2, pageSize: 1 }
		});

		expect(result.detail.totalRows).toBe(2);
		expect(result.detail.page).toBe(2);
		expect(result.detail.pageSize).toBe(1);
		expect(result.detail.rows).toHaveLength(1);
		expect(result.detail.rows[0].person.id).toBe('p-smith');
		expect(result.detail.rows[0].cells).toEqual([
			expect.objectContaining({
				trainingTypeId: 'type-cpr',
				status: 'not-completed',
				label: 'Not Done',
				date: null
			})
		]);
		expect(result.dashboard.readinessPercent).toBe(50);
		expect(result.dashboard.statusCounts.current).toBe(1);
		expect(result.dashboard.statusCounts.notCompleted).toBe(1);
		expect(result.filterOptions.ranks).toEqual(['SGT', 'SPC', 'PFC']);
	});

	it('keeps observed active, retired, discovered, and unknown Personnel ranks in report filters', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel', [
			personnelRow({ id: 'p-retired', rank: 'SP4' }),
			personnelRow({ id: 'p-discovered', rank: 'SGT' }),
			personnelRow({ id: 'p-unknown', rank: 'LOCAL-CADET' })
		]);
		store.seed('organization_rank_catalog', [
			rankCatalogRow({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy', pay_grade: 'E-5' }),
			rankCatalogRow({ code: 'SSgt', label: 'Staff Sergeant', service: 'air-force', pay_grade: 'E-5' }),
			rankCatalogRow({ code: 'SP4', label: 'Specialist Four', state: 'retired', pay_grade: 'E-4' })
		]);

		const result = await fetchTrainingReportPage(ctx);

		expect(result.filterOptions.ranks).toEqual(['SGT', 'SP4', 'LOCAL-CADET']);
	});

	it('sorts report rows by catalog rank precedence with unknown ranks last', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel', [
			personnelRow({ id: 'p-unknown', rank: 'LOCAL-CADET', last_name: 'Able' }),
			personnelRow({ id: 'p-navy', rank: 'PO2', last_name: 'Baker' }),
			personnelRow({ id: 'p-army', rank: 'SGT', last_name: 'Able' }),
			personnelRow({ id: 'p-air-force', rank: 'SSgt', last_name: 'Charlie' })
		]);
		store.seed('organization_rank_catalog', [
			rankCatalogRow({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy', pay_grade: 'E-5' }),
			rankCatalogRow({ code: 'SGT', label: 'Sergeant', service: 'army', pay_grade: 'E-5' }),
			rankCatalogRow({ code: 'SSgt', label: 'Staff Sergeant', service: 'air-force', pay_grade: 'E-5' })
		]);
		store.seed('training_types', [
			{
				id: 'type-cpr',
				organization_id: ORG,
				name: 'CPR',
				description: null,
				expiration_months: null,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#22c55e',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			}
		]);

		const input = {
			sort: { column: 'rank' as const, direction: 'asc' as const },
			pagination: { page: 1, pageSize: 10 }
		};

		const page = await fetchTrainingReportPage(ctx, input);
		const detail = await fetchTrainingReportDetailPage(ctx, input);

		expect(page.detail.rows.map((row) => row.person.id)).toEqual(['p-navy', 'p-army', 'p-air-force', 'p-unknown']);
		expect(detail.rows.map((row) => row.person.id)).toEqual(['p-navy', 'p-army', 'p-air-force', 'p-unknown']);
	});

	it('clamps oversized page requests to the last available report page', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed(
			'personnel',
			Array.from({ length: 105 }, (_, index) => ({
				id: `p-${String(index).padStart(3, '0')}`,
				organization_id: ORG,
				rank: 'SPC',
				last_name: `Person ${String(index).padStart(3, '0')}`,
				first_name: 'Test',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				archived_at: null,
				groups: null
			}))
		);
		store.seed('training_types', [
			{
				id: 'type-cpr',
				organization_id: ORG,
				name: 'CPR',
				description: null,
				expiration_months: null,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#22c55e',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			}
		]);

		const result = await fetchTrainingReportPage(ctx, {
			sort: { column: 'name', direction: 'asc' },
			pagination: { page: 999, pageSize: 999 }
		});

		expect(result.detail.pageSize).toBe(100);
		expect(result.detail.totalRows).toBe(105);
		expect(result.detail.totalPages).toBe(2);
		expect(result.detail.page).toBe(2);
		expect(result.detail.rows).toHaveLength(5);
	});

	it('returns a detail-only report page without aggregate metadata', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel', [
			{
				id: 'p-smith',
				organization_id: ORG,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				archived_at: null,
				groups: null
			},
			{
				id: 'p-adams',
				organization_id: ORG,
				rank: 'SPC',
				last_name: 'Adams',
				first_name: 'John',
				mos: '11B',
				clinic_role: 'Line',
				group_id: null,
				archived_at: null,
				groups: null
			}
		]);
		store.seed('training_types', [
			{
				id: 'type-cpr',
				organization_id: ORG,
				name: 'CPR',
				description: null,
				expiration_months: null,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#22c55e',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			}
		]);

		const detail = await fetchTrainingReportDetailPage(ctx, {
			sort: { column: 'name', direction: 'asc' },
			pagination: { page: 2, pageSize: 1 }
		});

		expect(detail.totalRows).toBe(2);
		expect(detail.page).toBe(2);
		expect(detail.rows).toHaveLength(1);
		expect(detail.rows[0].person.id).toBe('p-smith');
		expect(detail.sort).toEqual({ column: 'name', direction: 'asc' });
	});

	it('returns only scoped report rows for a Training-only member whose Personnel SELECT is denied', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['group-1'] },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'view',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		const store = ctx.rawStore;
		store.seed('groups', [
			{ id: 'group-1', organization_id: ORG, name: 'Alpha', sort_order: 0 },
			{ id: 'group-2', organization_id: ORG, name: 'Bravo', sort_order: 1 }
		]);

		store.seed('personnel', [
			{
				id: 'p-alpha',
				organization_id: ORG,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Ann',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-1',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-bravo',
				organization_id: ORG,
				rank: 'SPC',
				last_name: 'Bravo',
				first_name: 'Ben',
				mos: '11B',
				clinic_role: 'Line',
				group_id: 'group-2',
				archived_at: null,
				groups: { name: 'Bravo' }
			}
		]);
		store.seed('training_types', [
			{
				id: 'type-cpr',
				organization_id: ORG,
				name: 'CPR',
				description: null,
				expiration_months: null,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#22c55e',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			}
		]);
		store.seed('personnel_trainings', [
			{
				id: 'pt-alpha-cpr',
				organization_id: ORG,
				personnel_id: 'p-alpha',
				training_type_id: 'type-cpr',
				completion_date: '2026-01-01',
				expiration_date: null,
				notes: null,
				certificate_url: null
			},
			{
				id: 'pt-bravo-cpr',
				organization_id: ORG,
				personnel_id: 'p-bravo',
				training_type_id: 'type-cpr',
				completion_date: '2026-01-01',
				expiration_date: null,
				notes: null,
				certificate_url: null
			}
		]);

		const authorizedRoster = await ctx.personnelTrainingRoster!.listActiveForReports(ctx.auth);
		ctx.personnelTrainingRoster = {
			...ctx.personnelTrainingRoster!,
			listActiveForReports: async () => authorizedRoster
		};
		const rawFindMany = ctx.rawStore.findMany.bind(ctx.rawStore);
		ctx.rawStore.findMany = ((table, orgId, filters, options) => {
			if (table === 'personnel') throw new Error('Personnel SELECT denied for this Training-only actor');
			if (table === 'organization_rank_catalog') {
				throw new Error('Report rank catalog must use the authorized request store');
			}
			return rawFindMany(table, orgId, filters, options);
		}) as typeof ctx.rawStore.findMany;
		const requestFindMany = ctx.store.findMany.bind(ctx.store);
		ctx.store.findMany = ((table, orgId, filters, options) =>
			table === 'organization_rank_catalog'
				? Promise.resolve([])
				: requestFindMany(table, orgId, filters, options)) as typeof ctx.store.findMany;

		const result = await fetchTrainingReportPage(ctx);

		expect(result.detail.totalRows).toBe(1);
		expect(result.detail.rows[0].person.id).toBe('p-alpha');
		expect(result.filterOptions.groups.map((group) => group.name)).toEqual(['Alpha', 'Bravo']);
	});

	it('generates an authorized full workbook export without applying detail pagination', async () => {
		const ctx = createQueryPortsContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-1'] } } });
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel', [
			{
				id: 'p-alpha',
				organization_id: ORG,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Ann',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-1',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-able',
				organization_id: ORG,
				rank: 'SPC',
				last_name: 'Able',
				first_name: 'Amy',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-1',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-bravo',
				organization_id: ORG,
				rank: 'SPC',
				last_name: 'Bravo',
				first_name: 'Ben',
				mos: '11B',
				clinic_role: 'Line',
				group_id: 'group-2',
				archived_at: null,
				groups: { name: 'Bravo' }
			}
		]);
		store.seed('training_types', [
			{
				id: 'type-cpr',
				organization_id: ORG,
				name: 'CPR',
				description: null,
				expiration_months: null,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#22c55e',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			}
		]);

		const exportResult = await generateTrainingReportWorkbookExport(ctx, {
			sort: { column: 'name', direction: 'asc' },
			pagination: { page: 1, pageSize: 1 }
		});
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(exportResult.buffer as WorkbookLoadBuffer);
		const sheet = workbook.getWorksheet('Training Report')!;

		expect(exportResult.filename).toMatch(/^training-report-.*\.xlsx$/);
		expect(sheet.rowCount).toBe(3);
		expect(sheet.getCell('A2').value).toBe('Able, Amy');
		expect(sheet.getCell('A3').value).toBe('Alpha, Ann');
		expect(sheet.getColumn(1).values).not.toContain('Bravo, Ben');
	});

	it('denies report reads without Training view capability', async () => {
		const ctx = createQueryPortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});

		await expect(fetchTrainingReportPage(ctx)).rejects.toMatchObject({ status: 403 });
		await expect(fetchTrainingReportDetailPage(ctx)).rejects.toMatchObject({ status: 403 });
		await expect(generateTrainingReportWorkbookExport(ctx)).rejects.toMatchObject({ status: 403 });
	});
});

function personnelRow(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: overrides.id ?? 'person-1',
		organization_id: ORG,
		rank: overrides.rank ?? 'SGT',
		last_name: overrides.last_name ?? 'Soldier',
		first_name: overrides.first_name ?? 'Test',
		mos: overrides.mos ?? '68W',
		clinic_role: overrides.clinic_role ?? 'Medic',
		group_id: null,
		archived_at: null,
		groups: null,
		...overrides
	};
}

function rankCatalogRow(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: overrides.id ?? `rank-${overrides.code ?? 'SGT'}`,
		organization_id: ORG,
		code: overrides.code ?? 'SGT',
		label: overrides.label ?? overrides.code ?? 'Sergeant',
		service: overrides.service ?? 'army',
		category: overrides.category ?? 'enlisted',
		pay_grade: overrides.pay_grade ?? 'E-5',
		state: overrides.state ?? 'active',
		source: overrides.source ?? 'custom',
		sort_order: overrides.sort_order ?? 0,
		...overrides
	};
}
