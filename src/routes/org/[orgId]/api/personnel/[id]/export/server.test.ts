import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';
import { WORKBOOK_MIME_TYPE } from '$lib/export/workbook';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function worksheetRows(sheet: ExcelJS.Worksheet): Array<{ field: string; value: string }> {
	const rows: Array<{ field: string; value: string }> = [];

	sheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return;
		rows.push({
			field: String(row.getCell(1).value ?? ''),
			value: String(row.getCell(2).value ?? '')
		});
	});

	return rows;
}

function toWorkbookBuffer(buffer: ArrayBuffer): WorkbookLoadBuffer {
	return Buffer.from(buffer) as unknown as WorkbookLoadBuffer;
}

describe('GET /api/personnel/[id]/export', () => {
	it('declares policy-first authorization for Personnel export', () => {
		expect(_getConfig).toMatchObject({
			policyAction: POLICY_ACTION_CATALOG.personnel.exportRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect('permission' in _getConfig).toBe(false);
		expect('deferPolicyToUseCase' in _getConfig).toBe(false);
	});

	it('establishes a route-level policy gate for Personnel export', async () => {
		const requirePrivileged = vi.fn(() => {
			throw new Error('legacy requirePrivileged should not authorize Personnel export');
		});
		const ctx = createTestContext({
			auth: {
				requirePrivileged,
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				archived_at: null
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, { personnelId: 'p-1' });

		expect(result._filename).toContain('SGT_Smith_Jamie-export');
		expect(requirePrivileged).not.toHaveBeenCalled();
	});

	it('checks scoped Personnel export access before loading related record sets', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['allowed-group'] }
			}
		});
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				group_id: 'other-group',
				archived_at: null
			}
		]);
		const findManySpy = vi.spyOn(ctx.rawStore, 'findMany');

		await expect(handleUseCaseRequest(_getConfig, ctx, { personnelId: 'p-1' })).rejects.toMatchObject({
			status: 403
		});

		expect(findManySpy).not.toHaveBeenCalled();
	});

	it('includes ETS and PCS / DEROS in the personnel info worksheet', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: '2027-05-01',
				deros: '2026-11-30',
				archived_at: null
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, { personnelId: 'p-1' });
		const response = _getConfig.formatOutput?.(result);

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(result._buffer));

		const infoSheet = workbook.getWorksheet('Personnel Info');
		expect(infoSheet).toBeDefined();
		if (!infoSheet) throw new Error('Personnel Info sheet missing');

		expect(worksheetRows(infoSheet)).toEqual(
			expect.arrayContaining([
				{ field: 'Duty Role', value: 'Medic' },
				{ field: 'ETS', value: '2027-05-01' },
				{ field: 'PCS / DEROS', value: '2026-11-30' }
			])
		);
		expect(response?.headers.get('Content-Type')).toBe(WORKBOOK_MIME_TYPE);
		expect(response?.headers.get('Content-Disposition')).toMatch(
			/attachment; filename="SGT_Smith_Jamie-export-.*\.xlsx"/
		);
	});
});
