import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function rowValues(sheet: ExcelJS.Worksheet, rowNumber: number): string[] {
	const values = sheet.getRow(rowNumber).values;
	if (!Array.isArray(values)) return [];
	return values.slice(1).map((value) => String(value ?? ''));
}

function toWorkbookBuffer(buffer: ArrayBuffer): WorkbookLoadBuffer {
	return Buffer.from(buffer) as unknown as WorkbookLoadBuffer;
}

describe('POST /api/export-excel', () => {
	it('requires Leader Book view policy before exporting counseling and goals worksheets', async () => {
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
				compatibilityLanes: { leadersBook: 'none' },
				requireManageMembers() {}
			}
		});

		await expect(handleUseCaseRequest(_postConfig, ctx, { email: 'leader@example.com' })).rejects.toMatchObject({
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

	it('includes ETS and PCS / DEROS columns in the personnel worksheet', async () => {
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

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(result._buffer as ArrayBuffer));

		const personnelSheet = workbook.getWorksheet('Personnel');
		const exportRows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(personnelSheet).toBeDefined();
		if (!personnelSheet) throw new Error('Personnel sheet missing');

		expect(rowValues(personnelSheet, 1)).toContain('Duty Role');
		expect(rowValues(personnelSheet, 1)).toContain('ETS');
		expect(rowValues(personnelSheet, 1)).toContain('PCS / DEROS');
		expect(rowValues(personnelSheet, 2)).toContain('2027-05-01');
		expect(rowValues(personnelSheet, 2)).toContain('2026-11-30');
		expect(exportRows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'completed'
			})
		]);
	});

	it('still returns the workbook when the export status write fails', async () => {
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

		const originalUpdate = ctx.rawStore.update.bind(ctx.rawStore);
		ctx.rawStore.update = async (...args) => {
			const [table] = args;
			if (table === 'data_exports') {
				throw new Error('UPDATE denied for data_exports');
			}
			return originalUpdate(...args);
		};

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(result._buffer as ArrayBuffer));

		const personnelSheet = workbook.getWorksheet('Personnel');
		const exportRows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(personnelSheet).toBeDefined();
		if (!personnelSheet) throw new Error('Personnel sheet missing');

		expect(rowValues(personnelSheet, 2)).toContain('2027-05-01');
		expect(rowValues(personnelSheet, 2)).toContain('2026-11-30');
		expect(exportRows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'processing'
			})
		]);
	});
});
