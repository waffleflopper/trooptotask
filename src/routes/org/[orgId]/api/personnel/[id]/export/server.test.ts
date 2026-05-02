import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { createCompatibilityLaneMap } from '$lib/access/memberAccessShape';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

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
	it('uses policy decisions instead of route-level privileged authorization', async () => {
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

	it("requires Leader's Book view policy before including counseling and development goals", async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'configure',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				},
				compatibilityLanes: createCompatibilityLaneMap('none'),
				requirePrivileged() {}
			}
		});

		await expect(handleUseCaseRequest(_getConfig, ctx, { personnelId: 'p-1' })).rejects.toMatchObject({
			status: 403
		});
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'leadersBook.viewRecords',
				details: expect.objectContaining({
					policyAction: 'leadersBook.viewRecords',
					reasonCode: 'denied:missing-capability'
				})
			})
		);
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
	});
});
