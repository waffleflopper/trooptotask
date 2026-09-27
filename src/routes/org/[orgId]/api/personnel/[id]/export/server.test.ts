import { describe, expect, it } from 'vitest';
import { WORKBOOK_MIME_TYPE } from '$lib/export/workbook';
import { createTestContext } from '$lib/server/adapters/inMemory';
import ExcelJS from 'exceljs';
import { _getConfig } from './+server';

const PERSONNEL_ID = '11111111-1111-4111-8111-111111111111';

describe('GET /api/personnel/[id]/export', () => {
	it('formats workbook buffers with the existing Excel MIME type and attachment header', () => {
		const response = _getConfig.formatOutput?.({
			_buffer: new TextEncoder().encode('workbook').buffer,
			_filename: 'SGT_Smith_Jamie-export-2026-05-20.xlsx'
		});

		expect(response?.headers.get('Content-Type')).toBe(WORKBOOK_MIME_TYPE);
		expect(response?.headers.get('Content-Disposition')).toBe(
			'attachment; filename="SGT_Smith_Jamie-export-2026-05-20.xlsx"'
		);
	});

	it('includes saved availability history for an authorized Personnel exporter without Calendar access', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					personnel: 'configure',
					calendar: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.rawStore.seed('personnel', [
			{ id: PERSONNEL_ID, organization_id: ctx.auth.orgId, group_id: null, first_name: 'Jamie', last_name: 'Smith' }
		]);
		ctx.rawStore.seed('status_types', [{ id: 'status-1', organization_id: ctx.auth.orgId, name: 'TDY' }]);
		ctx.rawStore.seed('availability_entries', [
			{
				id: 'old',
				organization_id: ctx.auth.orgId,
				personnel_id: PERSONNEL_ID,
				status_type_id: 'status-1',
				start_date: '2025-01-01',
				end_date: '2025-01-03'
			},
			{
				id: 'new',
				organization_id: ctx.auth.orgId,
				personnel_id: PERSONNEL_ID,
				status_type_id: 'status-1',
				start_date: '2026-01-01',
				end_date: '2026-01-03'
			}
		]);

		const result = await _getConfig.fn(ctx, { personnelId: PERSONNEL_ID });
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(Buffer.from(result._buffer) as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]);
		const history = workbook.getWorksheet('Availability History');
		expect(history?.getRow(2).getCell(1).value).toBe('TDY');
		expect(history?.getRow(2).getCell(2).value).toBe('2026-01-01');
		expect(history?.getRow(3).getCell(2).value).toBe('2025-01-01');
	});
});
