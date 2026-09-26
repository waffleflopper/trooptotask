import { afterEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
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

function readyWorkbookBuffer(result: Awaited<ReturnType<(typeof _postConfig)['fn']>>): ArrayBuffer {
	expect(result.status).toBe('ready');
	if (result.status !== 'ready') throw new Error('Expected export to be ready');
	return result.artifact.buffer;
}

describe('POST /api/export-excel', () => {
	it.each([
		{ label: 'ordinary member', scopeSet: { kind: 'organization' as const } },
		{ label: 'Group-scoped member', scopeSet: { kind: 'groups' as const, groupIds: ['alpha'] } }
	])('rejects $label without exporting or creating lifecycle records', async ({ scopeSet }) => {
		const ctx = createTestContext({ auth: { role: 'member', isPrivileged: false, canManageMembers: false, scopeSet } });
		await expect(handleUseCaseRequest(_postConfig, ctx, { email: 'member@example.com' })).rejects.toMatchObject({
			status: 403
		});
		expect(await ctx.rawStore.findMany('data_exports', ctx.auth.orgId)).toEqual([]);
		expect(
			ctx.auditPort.events.filter(
				(event) => event.action === 'export.created' || event.action === 'export.excel_created'
			)
		).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('downloads above former quotas and excludes another Organization', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed(
			'data_exports',
			Array.from({ length: 11 }, (_, i) => ({
				id: `previous-${i}`,
				org_id: ctx.auth.orgId,
				created_at: new Date().toISOString(),
				status: 'completed'
			}))
		);
		ctx.rawStore.seed('personnel', [
			{ id: 'own-person', organization_id: ctx.auth.orgId, first_name: 'Local', last_name: 'Person', rank: 'SGT' },
			{ id: 'foreign-person', organization_id: 'other-org', first_name: 'Private', last_name: 'Foreign', rank: 'SGT' }
		]);
		const result = await handleUseCaseRequest(_postConfig, ctx, { email: 'owner@example.com' });
		const response = _postConfig.formatOutput?.(result);
		expect(response?.status).toBe(200);
		expect(response?.headers.get('Content-Disposition')).toMatch(/^attachment; filename="org-export-test-org-/);
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(await response!.arrayBuffer()));
		const rowsInWorkbook = workbook.getWorksheet('Raw - Personnel')!.getSheetValues().flat(2);
		expect(rowsInWorkbook).toContain('own-person');
		expect(rowsInWorkbook).not.toContain('foreign-person');
		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(rows).toHaveLength(12);
		expect(rows.find((row) => row.requested_by === ctx.auth.userId)).toMatchObject({ status: 'completed' });
	});

	it('uses the organization data export policy boundary', () => {
		expect('permission' in _postConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.organization.exportData);
		expect(_postConfig.policyResource).toEqual({ kind: 'organization' });
	});

	it('allows delegated member managers to export organization workbooks', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: true,
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
		ctx.rawStore.seed('leader_notes', [
			{ id: 'own-note', organization_id: ctx.auth.orgId, personnel_id: 'p-1', text: 'Retained history' },
			{ id: 'foreign-note', organization_id: 'other-org', personnel_id: 'p-2', text: 'Foreign' }
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'member-manager@example.com'
		});

		expect(result.status).toBe('ready');
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(readyWorkbookBuffer(result)));
		const rows = workbook.getWorksheet('Raw - Leader Notes')!.getSheetValues().flat(2);
		expect(rows).toContain('own-note');
		expect(rows).not.toContain('foreign-note');
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
		const response = _postConfig.formatOutput?.(result);

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(readyWorkbookBuffer(result)));

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
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'export.excel_created',
				resourceType: 'data_export',
				resourceId: exportRows[0].id
			})
		);
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
		await workbook.xlsx.load(toWorkbookBuffer(readyWorkbookBuffer(result)));

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
		await workbook.xlsx.load(toWorkbookBuffer(readyWorkbookBuffer(result)));

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

	it('exports archived personnel and retained Calendar and Sign-in Roster sheets', async () => {
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
		ctx.rawStore.seed('assignment_types', [
			{
				id: 'type-1',
				organization_id: ctx.auth.orgId,
				name: 'Clinic coverage',
				assign_to: 'personnel'
			},
			{
				id: 'group-type-1',
				organization_id: ctx.auth.orgId,
				name: 'Group coverage',
				assign_to: 'group'
			}
		]);
		ctx.rawStore.seed('groups', [{ id: 'group-1', organization_id: ctx.auth.orgId, name: 'Alpha Group' }]);
		ctx.rawStore.seed('daily_assignments', [
			{
				id: 'assignment-1',
				organization_id: ctx.auth.orgId,
				assignment_type_id: 'type-1',
				assignee_id: 'p-archived',
				date: '2026-05-20'
			},
			{
				id: 'group-assignment-1',
				organization_id: ctx.auth.orgId,
				assignment_type_id: 'group-type-1',
				assignee_id: 'group-1',
				date: '2026-05-21'
			}
		]);
		ctx.rawStore.seed('sign_in_rosters', [
			{
				id: 'roster-1',
				organization_id: ctx.auth.orgId,
				name: 'Clinic training'
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(readyWorkbookBuffer(result)));

		const inventory = workbook.getWorksheet('Export Inventory');
		const personnel = workbook.getWorksheet('Personnel');
		const rawPersonnel = workbook.getWorksheet('Raw - Personnel');
		const assignments = workbook.getWorksheet('Raw - Daily Assignments');
		const readableAssignments = workbook.getWorksheet('Daily Assignments');
		const signInRosters = workbook.getWorksheet('Raw - Sign-in Rosters');

		expect(inventory).toBeDefined();
		expect(personnel).toBeDefined();
		expect(rawPersonnel).toBeDefined();
		expect(assignments).toBeDefined();
		expect(readableAssignments).toBeDefined();
		expect(signInRosters).toBeDefined();
		if (!inventory || !personnel || !rawPersonnel || !assignments || !readableAssignments || !signInRosters) {
			throw new Error('Retained export worksheets missing');
		}

		expect(rowValues(inventory, 1)).toEqual(['Area', 'Area Key', 'Section', 'Raw Table', 'JSON Key', 'Rows']);
		expect(rowValues(personnel, 2)).toContain('Archived');
		expect(rowValues(personnel, 2)).toContain('2026-05-01T00:00:00Z');
		expect(rowValues(rawPersonnel, 2)).toContain('p-archived');
		expect(assignments.getSheetValues().flat(2)).toContain('assignment-1');
		expect(readableAssignments.getSheetValues().flat(2)).toContain('SSG Archived, Alex');
		expect(readableAssignments.getSheetValues().flat(2)).toContain('Alpha Group');
		expect(rowValues(signInRosters, 2)).toContain('roster-1');
		expect(workbook.worksheets.some((sheet) => /duty roster|advanced duty/i.test(sheet.name))).toBe(false);
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
		await workbook.xlsx.load(toWorkbookBuffer(readyWorkbookBuffer(result)));

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
