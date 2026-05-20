import { afterEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';
import { WORKBOOK_MIME_TYPE } from '$lib/export/workbook';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

afterEach(() => {
	vi.restoreAllMocks();
});

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
		const response = _postConfig.formatOutput?.(result);

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
		expect(response?.headers.get('Content-Type')).toBe(WORKBOOK_MIME_TYPE);
		expect(response?.headers.get('Content-Disposition')).toMatch(/attachment; filename="org-export-.*\.xlsx"/);
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
		ctx.rawStore.seed('personnel_extended_info', [
			{
				id: 'ext-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				emergency_contact_name: 'Taylor Smith',
				personal_phone: '555-0101',
				address_street: '123 Main St',
				address_city: 'Anchorage',
				address_state: 'AK',
				address_zip: '99505'
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
		const personnel = workbook.getWorksheet('Personnel');

		expect(leaderNotes).toBeDefined();
		expect(followUps).toBeDefined();
		expect(documents).toBeDefined();
		expect(personnel).toBeDefined();
		if (!leaderNotes || !followUps || !documents || !personnel)
			throw new Error('Personnel artifact worksheets missing');

		expect(rowValues(leaderNotes, 2)).toContain('Follow up after range week');
		expect(rowValues(followUps, 2)).toContain('Review packet');
		expect(rowValues(documents, 2)).toContain('orders.pdf');
		expect(rowValues(personnel, 2)).toContain('Taylor Smith');
		expect(rowValues(personnel, 2)).toContain('555-0101');
		expect(rowValues(personnel, 2)).toContain('123 Main St, Anchorage, AK, 99505');
	});

	it('resolves foreign keys to human-readable labels in the Excel workbook', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('groups', [{ id: 'group-1', organization_id: ctx.auth.orgId, name: 'Alpha' }]);
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				group_id: 'group-1',
				archived_at: null
			}
		]);
		ctx.rawStore.seed('status_types', [
			{ id: 'status-1', organization_id: ctx.auth.orgId, name: 'TDY', color: '#000000', text_color: '#ffffff' }
		]);
		ctx.rawStore.seed('assignment_types', [
			{ id: 'assignment-1', organization_id: ctx.auth.orgId, name: 'CQ', color: '#000000' }
		]);
		ctx.rawStore.seed('training_types', [
			{ id: 'training-1', organization_id: ctx.auth.orgId, name: 'Weapons Qual', color: '#000000' }
		]);
		ctx.rawStore.seed('availability_entries', [
			{
				id: 'availability-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				status_type_id: 'status-1',
				start_date: '2026-05-20',
				end_date: '2026-05-21'
			}
		]);
		ctx.rawStore.seed('daily_assignments', [
			{
				id: 'daily-1',
				organization_id: ctx.auth.orgId,
				assignee_id: 'p-1',
				assignment_type_id: 'assignment-1',
				date: '2026-05-20'
			}
		]);
		ctx.rawStore.seed('personnel_trainings', [
			{
				id: 'ptr-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				training_type_id: 'training-1',
				completion_date: '2026-05-01'
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(result._buffer as ArrayBuffer));

		const calendar = workbook.getWorksheet('Calendar');
		const dailyAssignments = workbook.getWorksheet('Daily Assignments');
		const trainingRecords = workbook.getWorksheet('Training Records');
		const rawTraining = workbook.getWorksheet('Raw - Personnel Trainings');

		expect(calendar).toBeDefined();
		expect(dailyAssignments).toBeDefined();
		expect(trainingRecords).toBeDefined();
		expect(rawTraining).toBeDefined();
		if (!calendar || !dailyAssignments || !trainingRecords || !rawTraining) {
			throw new Error('Expected export worksheets missing');
		}

		expect(rowValues(calendar, 2)).toContain('SGT Smith, Jamie');
		expect(rowValues(calendar, 2)).toContain('TDY');
		expect(rowValues(dailyAssignments, 2)).toContain('SGT Smith, Jamie');
		expect(rowValues(dailyAssignments, 2)).toContain('CQ');
		expect(rowValues(trainingRecords, 2)).toContain('SGT Smith, Jamie');
		expect(rowValues(trainingRecords, 2)).toContain('Weapons Qual');
		expect(rowValues(rawTraining, 2)).toContain('training-1');
	});

	it('exports duty roster sections and archived personnel in named worksheets', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-archived',
				organization_id: ctx.auth.orgId,
				rank: 'SSG',
				last_name: 'Archived',
				first_name: 'Alex',
				archived_at: '2026-05-01T00:00:00Z'
			}
		]);
		ctx.rawStore.seed('duty_roster_templates', [
			{
				id: 'template-1',
				organization_id: ctx.auth.orgId,
				name: 'Staff Duty',
				slug: 'staff-duty',
				status: 'active'
			}
		]);
		ctx.rawStore.seed('duty_roster_template_runs', [
			{
				id: 'run-1',
				organization_id: ctx.auth.orgId,
				template_id: 'template-1',
				template_name: 'Staff Duty',
				snapshot_payload: { rows: [{ date: '2026-05-20', da6: 'D1' }] }
			}
		]);
		ctx.rawStore.seed('duty_roster_template_run_corrections', [
			{
				id: 'correction-1',
				organization_id: ctx.auth.orgId,
				run_id: 'run-1',
				run_row_date: '2026-05-20',
				reason: 'Manual swap'
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(result._buffer as ArrayBuffer));

		const inventory = workbook.getWorksheet('Export Inventory');
		const personnel = workbook.getWorksheet('Personnel');
		const rawPersonnel = workbook.getWorksheet('Raw - Personnel');
		const templates = workbook.getWorksheet('Duty Roster Templates');
		const runs = workbook.getWorksheet('Duty Roster Template Runs');
		const corrections = workbook.worksheets.find((sheet) => sheet.name.startsWith('Duty Roster Template Run Cor'));

		expect(inventory).toBeDefined();
		expect(personnel).toBeDefined();
		expect(rawPersonnel).toBeDefined();
		expect(templates).toBeDefined();
		expect(runs).toBeDefined();
		expect(corrections).toBeDefined();
		if (!inventory || !personnel || !rawPersonnel || !templates || !runs || !corrections) {
			throw new Error('Duty roster export worksheets missing');
		}

		expect(rowValues(inventory, 1)).toEqual(['Area', 'Section', 'Raw Table', 'JSON Key', 'Rows']);
		expect(rowValues(personnel, 2)).toContain('Archived');
		expect(rowValues(personnel, 2)).toContain('2026-05-01T00:00:00Z');
		expect(rowValues(rawPersonnel, 2)).toContain('p-archived');
		expect(rowValues(templates, 2)).toContain('template-1');
		expect(rowValues(runs, 2)).toContain('run-1');
		expect(rowValues(corrections, 2)).toContain('correction-1');
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
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('[data-exports] Failed to mark export'),
			expect.any(Error)
		);
		expect(exportRows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'processing'
			})
		]);
	});
});
