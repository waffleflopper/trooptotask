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

	it('includes personnel detail artifact worksheets', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				group_id: null,
				archived_at: null
			}
		]);
		ctx.rawStore.seed('leader_notes', [
			{
				id: 'note-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				author: ctx.auth.userId,
				text: 'Follow up after range week'
			}
		]);
		ctx.rawStore.seed('personnel_follow_ups', [
			{
				id: 'follow-up-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				title: 'Review packet',
				status: 'open'
			}
		]);
		ctx.rawStore.seed('personnel_documents', [
			{
				id: 'document-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				title: 'Orders',
				file_path: `${ctx.auth.orgId}/personnel/p-1/documents/orders.pdf`,
				file_size_bytes: 1024,
				content_type: 'application/pdf',
				uploaded_by: ctx.auth.userId
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(result._buffer as ArrayBuffer));

		const leaderNotes = workbook.getWorksheet('Leader Notes');
		const followUps = workbook.getWorksheet('Personnel Follow-ups');
		const documents = workbook.getWorksheet('Personnel Documents');

		expect(leaderNotes).toBeDefined();
		expect(followUps).toBeDefined();
		expect(documents).toBeDefined();
		if (!leaderNotes || !followUps || !documents) throw new Error('Personnel artifact worksheets missing');

		expect(rowValues(leaderNotes, 2)).toContain('Follow up after range week');
		expect(rowValues(followUps, 2)).toContain('Review packet');
		expect(rowValues(documents, 2)).toContain('orders.pdf');
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
