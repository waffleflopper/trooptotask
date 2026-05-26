import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { WORKBOOK_MIME_TYPE } from '$lib/export/workbook';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

async function loadReportSheet(buffer: ArrayBuffer): Promise<ExcelJS.Worksheet> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(buffer as WorkbookLoadBuffer);
	return workbook.getWorksheet('Critical Tasks Report')!;
}

function columnValues(sheet: ExcelJS.Worksheet, column: number): readonly unknown[] {
	return sheet.getColumn(column).values;
}

function rowValuesForMetric(sheet: ExcelJS.Worksheet, metric: string): unknown[] | undefined {
	for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
		const values = sheet.getRow(rowNumber).values as unknown[];
		if (values[2] === metric) {
			return values;
		}
	}
	return undefined;
}

function rowNumberForMetric(sheet: ExcelJS.Worksheet, metric: string): number {
	for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
		const values = sheet.getRow(rowNumber).values as unknown[];
		if (values[2] === metric) {
			return rowNumber;
		}
	}
	return -1;
}

describe('GET /api/critical-tasks/reports/export', () => {
	it('places filtered action rows before summary metadata', async () => {
		const ctx = createTestContext();
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				critical_tasks_default_expiration_months: 12,
				critical_tasks_expiring_soon_warning_days: 60
			}
		]);
		ctx.store.seed('groups', [
			{ id: 'group-alpha', organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 },
			{ id: 'group-bravo', organization_id: ctx.auth.orgId, name: 'Bravo', sort_order: 1 }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'p-nora',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'NoUpdate',
				first_name: 'Nora',
				mos: '11B',
				clinic_role: 'Rifleman',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-outside',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Outside',
				first_name: 'Olivia',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-bravo',
				archived_at: null,
				groups: { name: 'Bravo' }
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-common',
				organization_id: ctx.auth.orgId,
				task_code: '071-000-0001',
				title: 'Maintain communications',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			groupId: 'group-alpha',
			mos: undefined,
			role: undefined,
			rank: undefined
		});
		const sheet = await loadReportSheet(result.buffer);

		expect(sheet.getRow(1).values).toEqual([undefined, 'Section', 'Metric', 'Value', 'Subtitle']);
		expect(sheet.getRow(2).values).toEqual([
			undefined,
			'At-Risk Soldiers',
			'NoUpdate, Nora',
			'0%',
			'SPC 11B; Alpha; 0 expiring <=60d; No ICT update'
		]);
		expect(sheet.getRow(3).values).toEqual([
			undefined,
			'Tasks Below Unit Threshold',
			'071-000-0001 Maintain communications',
			'0%',
			'1 Soldiers need it'
		]);
		expect(sheet.getRow(4).values).toContain('Summary');
		expect(columnValues(sheet, 2)).not.toContain('Outside, Olivia');
		expect(columnValues(sheet, 5)).not.toContain('Bravo');
	});

	it('uses critical tasks read permission and returns a report-context workbook download', async () => {
		const ctx = createTestContext();
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				critical_tasks_default_expiration_months: 12,
				critical_tasks_expiring_soon_warning_days: 60
			}
		]);
		ctx.store.seed('groups', [
			{ id: 'group-alpha', organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 },
			{ id: 'group-bravo', organization_id: ctx.auth.orgId, name: 'Bravo', sort_order: 1 }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'p-smith',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-jones',
				organization_id: ctx.auth.orgId,
				rank: 'CPL',
				last_name: 'Jones',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Rifleman',
				group_id: 'group-bravo',
				archived_at: null,
				groups: { name: 'Bravo' }
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-medic',
				organization_id: ctx.auth.orgId,
				task_code: '181-105-1001',
				title: 'TCCC lane',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'task-common',
				organization_id: ctx.auth.orgId,
				task_code: '081-833-0010',
				title: 'Open airway',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-smith',
				ict_task_id: 'task-medic',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-2',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-smith',
				ict_task_id: 'task-common',
				completed_at: '2025-12-20',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2025-12-20T00:00:00Z'
			},
			{
				id: 'completion-3',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-jones',
				ict_task_id: 'task-common',
				completed_at: '2024-01-01',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2024-01-01T00:00:00Z'
			}
		]);

		expect('permission' in _getConfig).toBe(false);

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			groupId: 'group-alpha',
			mos: undefined,
			role: undefined,
			rank: undefined
		});
		const response = _getConfig.formatOutput?.(result);
		const sheet = await loadReportSheet(result.buffer);

		expect(sheet.getRow(1).values).toEqual([undefined, 'Section', 'Metric', 'Value', 'Subtitle']);
		expect(columnValues(sheet, 2)).toContain('Overall Readiness');
		expect(columnValues(sheet, 3)).toContain('100%');
		expect(columnValues(sheet, 2)).toContain('Soldiers Below 70%');
		expect(columnValues(sheet, 4)).toContain('1 applicable Soldier');
		expect(columnValues(sheet, 4)).not.toContain('11B');
		expect(response?.headers.get('Content-Type')).toBe(WORKBOOK_MIME_TYPE);
		expect(response?.headers.get('Content-Disposition')).toMatch(
			/attachment; filename="critical-task-report-.*\.xlsx"/
		);
		expect(response?.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response?.headers.get('Vary')).toBe('Cookie');
	});

	it('does not leak other-group readiness data for scoped viewers', async () => {
		const ctx = createTestContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['group-alpha'] } } });
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				critical_tasks_default_expiration_months: 12,
				critical_tasks_expiring_soon_warning_days: 60
			}
		]);
		ctx.store.seed('groups', [
			{ id: 'group-alpha', organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 },
			{ id: 'group-bravo', organization_id: ctx.auth.orgId, name: 'Bravo', sort_order: 1 }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'p-smith',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-jones',
				organization_id: ctx.auth.orgId,
				rank: 'CPL',
				last_name: 'Jones',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Rifleman',
				group_id: 'group-bravo',
				archived_at: null,
				groups: { name: 'Bravo' }
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-common',
				organization_id: ctx.auth.orgId,
				task_code: '081-833-0010',
				title: 'Open airway',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-smith',
				ict_task_id: 'task-common',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-2',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-jones',
				ict_task_id: 'task-common',
				completed_at: '2024-01-01',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2024-01-01T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			groupId: undefined,
			mos: undefined,
			role: undefined,
			rank: undefined
		});

		const sheet = await loadReportSheet(result.buffer);
		expect(columnValues(sheet, 2)).toContain('Overall Readiness');
		expect(columnValues(sheet, 3)).toContain('100%');
		expect(columnValues(sheet, 2)).toContain('Soldiers Below 70%');
		expect(columnValues(sheet, 4)).toContain('1 applicable Soldier');
		expect(columnValues(sheet, 4)).not.toContain('11B');
	});

	it('includes filtered below-threshold task rows in worst-first order', async () => {
		const ctx = createTestContext();
		ctx.store.seed('organizations', [
			{
				id: ctx.auth.orgId,
				critical_tasks_default_expiration_months: 12,
				critical_tasks_expiring_soon_warning_days: 60
			}
		]);
		ctx.store.seed('groups', [
			{ id: 'group-alpha', organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 },
			{ id: 'group-bravo', organization_id: ctx.auth.orgId, name: 'Bravo', sort_order: 1 }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'p-alpha-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'One',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-alpha-2',
				organization_id: ctx.auth.orgId,
				rank: 'CPL',
				last_name: 'Alpha',
				first_name: 'Two',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-alpha-3',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'Alpha',
				first_name: 'Three',
				mos: '11B',
				clinic_role: 'Rifleman',
				group_id: 'group-alpha',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p-bravo',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'Bravo',
				first_name: 'Outside',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-bravo',
				archived_at: null,
				groups: { name: 'Bravo' }
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-worst',
				organization_id: ctx.auth.orgId,
				task_code: '071-000-0001',
				title: 'Maintain communications',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'task-gap',
				organization_id: ctx.auth.orgId,
				task_code: '081-000-0002',
				title: 'Move under direct fire',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'task-ready',
				organization_id: ctx.auth.orgId,
				task_code: '081-000-0003',
				title: 'Conduct PCC and PCI',
				description: null,
				mos: [],
				expiration_months: 12,
				sort_order: 2,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-gap',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-alpha-1',
				ict_task_id: 'task-gap',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-ready-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-alpha-1',
				ict_task_id: 'task-ready',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-ready-2',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-alpha-2',
				ict_task_id: 'task-ready',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-ready-3',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-alpha-3',
				ict_task_id: 'task-ready',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			},
			{
				id: 'completion-bravo-not-exported',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-bravo',
				ict_task_id: 'task-worst',
				completed_at: '2026-01-15',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-01-15T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			groupId: 'group-alpha',
			mos: undefined,
			role: undefined,
			rank: undefined
		});

		const sheet = await loadReportSheet(result.buffer);

		expect(rowValuesForMetric(sheet, '071-000-0001 Maintain communications')).toEqual([
			undefined,
			'Tasks Below Unit Threshold',
			'071-000-0001 Maintain communications',
			'0%',
			'3 Soldiers need it'
		]);
		expect(rowValuesForMetric(sheet, '081-000-0002 Move under direct fire')).toEqual([
			undefined,
			'Tasks Below Unit Threshold',
			'081-000-0002 Move under direct fire',
			'33%',
			'2 Soldiers need it'
		]);
		expect(rowNumberForMetric(sheet, '081-000-0002 Move under direct fire')).toBeGreaterThan(
			rowNumberForMetric(sheet, '071-000-0001 Maintain communications')
		);
		expect(columnValues(sheet, 2)).not.toContain('081-000-0003 Conduct PCC and PCI');
	});
});
