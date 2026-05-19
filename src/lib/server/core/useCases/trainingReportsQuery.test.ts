import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { createInMemoryDataStore, createQueryPortsContext } from '$lib/server/adapters/inMemory';
import {
	fetchTrainingReportPage,
	fetchTrainingReportsData,
	generateTrainingReportWorkbookExport
} from './trainingReportsQuery';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

const ORG = 'test-org';

function buildCtx() {
	return createQueryPortsContext();
}

describe('fetchTrainingReportsData', () => {
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

	it('limits report rows to the caller scoped group', async () => {
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

		const result = await fetchTrainingReportPage(ctx);

		expect(result.detail.totalRows).toBe(1);
		expect(result.detail.rows[0].person.id).toBe('p-alpha');
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

	it('fetches training records from the store and returns them', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel_trainings', [
			{
				id: 'pt-1',
				organization_id: ORG,
				personnel_id: 'p-1',
				training_type_id: 'tt-1',
				completion_date: '2026-01-01',
				expiration_date: '2027-01-01',
				notes: null,
				certificate_url: null
			}
		]);

		const result = await fetchTrainingReportsData(ctx);

		expect(result.trainings).toHaveLength(1);
		expect(result.trainings[0].personnelId).toBe('p-1');
		expect(result.trainings[0].trainingTypeId).toBe('tt-1');
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

		await expect(fetchTrainingReportsData(ctx)).rejects.toMatchObject({ status: 403 });
		await expect(fetchTrainingReportPage(ctx)).rejects.toMatchObject({ status: 403 });
		await expect(generateTrainingReportWorkbookExport(ctx)).rejects.toMatchObject({ status: 403 });
	});

	it('returns empty array when no training records exist', async () => {
		const ctx = buildCtx();

		const result = await fetchTrainingReportsData(ctx);

		expect(result.trainings).toHaveLength(0);
	});

	it('transforms snake_case DB rows to camelCase', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel_trainings', [
			{
				id: 'pt-1',
				organization_id: ORG,
				personnel_id: 'p-1',
				training_type_id: 'tt-1',
				completion_date: '2026-03-15',
				expiration_date: '2027-03-15',
				notes: 'test note',
				certificate_url: null
			}
		]);

		const result = await fetchTrainingReportsData(ctx);

		expect(result.trainings[0].completionDate).toBe('2026-03-15');
		expect(result.trainings[0].expirationDate).toBe('2027-03-15');
		expect(result.trainings[0].notes).toBe('test note');
	});
});
