import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { WORKBOOK_MIME_TYPE } from '$lib/export/workbook';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function toWorkbookBuffer(buffer: ArrayBuffer): WorkbookLoadBuffer {
	return buffer;
}

describe('GET /api/training-reports/export', () => {
	it('keeps training report export available through the existing training permission', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'p-smith',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-1',
				archived_at: null,
				groups: { name: 'Alpha' }
			}
		]);
		ctx.store.seed('training_types', [
			{
				id: 'type-cpr',
				organization_id: ctx.auth.orgId,
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

		expect(_getConfig.permission).toBe('training');
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.viewRecords);
		expect(_getConfig.policyResource).toEqual({ kind: 'unscoped' });

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			sortColumn: 'name',
			sortDirection: 'asc'
		});
		const response = _getConfig.formatOutput?.(result);
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(result.buffer));
		const sheet = workbook.getWorksheet('Training Report')!;

		expect(sheet.getRow(1).values).toEqual([undefined, 'Name', 'Rank', 'MOS', 'Duty Role', 'Group', 'CPR']);
		expect(sheet.getRow(2).values).toEqual([undefined, 'Smith, Jane', 'SGT', '68W', 'Medic', 'Alpha', 'Not Done']);
		expect(response?.headers.get('Content-Type')).toBe(WORKBOOK_MIME_TYPE);
		expect(response?.headers.get('Content-Disposition')).toMatch(/attachment; filename="training-report-.*\.xlsx"/);
		expect(response?.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response?.headers.get('Vary')).toBe('Cookie');
	});
});
