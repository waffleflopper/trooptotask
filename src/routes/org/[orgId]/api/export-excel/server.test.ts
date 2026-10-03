import { afterEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseNotificationStore } from '$features/notifications/index.server';
import { listFeedbackExportRows } from '$features/feedback/index.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _createPostConfig } from './+server';
import { createDeletionRequestTestStore } from '$features/deletion-requests/testing.server';
const configFor = (ctx: ReturnType<typeof createTestContext>) =>
	_createPostConfig(createDeletionRequestTestStore(ctx.rawStore));
import { WORKBOOK_MIME_TYPE } from '$lib/utils/workbook';

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

function readyWorkbookBuffer(result: Awaited<ReturnType<ReturnType<typeof _createPostConfig>['fn']>>): ArrayBuffer {
	expect(result.status).toBe('ready');
	if (result.status !== 'ready') throw new Error('Expected export to be ready');
	return result.artifact.buffer;
}

function createExportTestContext(overrides?: Parameters<typeof createTestContext>[0]) {
	const ctx = createTestContext(overrides);
	const communicationsRows: Record<'notifications' | 'beta_feedback', Record<string, unknown>[]> = {
		notifications: [],
		beta_feedback: []
	};
	const client = createClient('http://127.0.0.1:9', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const table = url.pathname.split('/').at(-1)!;
				if (!['notifications', 'beta_feedback'].includes(table) || (init?.method ?? 'GET') !== 'GET') {
					throw new Error('Unexpected communications transport request');
				}
				const rows = communicationsRows[table as keyof typeof communicationsRows].filter(
					(row) =>
						row.user_id === ctx.auth.userId &&
						(!url.searchParams.has('organization_id') ||
							url.searchParams.get('organization_id') === `eq.${row.organization_id}`) &&
						(!url.searchParams.has('user_id') || url.searchParams.get('user_id') === `eq.${row.user_id}`)
				);
				const offset = Number(url.searchParams.get('offset') ?? 0);
				const limit = Number(url.searchParams.get('limit') ?? 1000);
				const selection = url.searchParams.get('select');
				return Response.json(
					rows
						.slice(offset, offset + Math.min(limit, 1000))
						.map((row) =>
							!selection || selection === '*'
								? row
								: Object.fromEntries(selection.split(',').map((column) => [column, row[column]]))
						)
				);
			}
		}
	});
	ctx.notificationSelf.store = createSupabaseNotificationStore(client);
	ctx.feedbackExport = { listRows: (orgId) => listFeedbackExportRows(client, orgId) };
	return Object.assign(ctx, { communicationsRows });
}

describe('POST /api/export-excel', () => {
	it.each(['organizations', 'organization_memberships', 'personnel_onboardings', 'onboarding_step_progress'] as const)(
		'rejects a failed %s read without an artifact or success effects',
		async (failedTable) => {
			const ctx = createExportTestContext();
			const failure = new Error(`Saved ${failedTable} rows unavailable`);
			const findMany = ctx.rawStore.findMany.bind(ctx.rawStore);
			ctx.rawStore.findMany = async (table, ...args) => {
				if (table === failedTable) throw failure;
				return findMany(table, ...args);
			};

			await expect(handleUseCaseRequest(configFor(ctx), ctx, { email: 'owner@example.com' })).rejects.toBe(failure);

			const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
			expect(rows).toEqual([
				expect.objectContaining({
					requested_by: ctx.auth.userId,
					status: 'failed',
					completed_at: expect.any(String)
				})
			]);
			expect(rows[0]).not.toHaveProperty('file_size_bytes');
			expect(ctx.auditPort.events.filter((event) => event.action.startsWith('export.'))).toEqual([]);
			expect(ctx.notificationPort.notifications).toEqual([]);
		}
	);

	it.each([
		{ label: 'ordinary member', scopeSet: { kind: 'organization' as const } },
		{ label: 'Group-scoped member', scopeSet: { kind: 'groups' as const, groupIds: ['alpha'] } }
	])('rejects $label without exporting or creating lifecycle records', async ({ scopeSet }) => {
		const ctx = createExportTestContext({
			auth: { role: 'member', isPrivileged: false, canManageMembers: false, scopeSet }
		});
		await expect(handleUseCaseRequest(configFor(ctx), ctx, { email: 'member@example.com' })).rejects.toMatchObject({
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
		const ctx = createExportTestContext();
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
		const evaluation = {
			id: 'own-eval',
			organization_id: ctx.auth.orgId,
			rated_person_id: 'archived-person',
			eval_type: 'OER',
			rater_person_id: 'saved-rater',
			rater_name: null,
			senior_rater_person_id: null,
			senior_rater_name: 'LTC External',
			intermediate_rater_person_id: null,
			intermediate_rater_name: null,
			reviewer_person_id: 'saved-reviewer',
			reviewer_name: null,
			rating_period_start: '2025-09-30',
			rating_period_end: '2026-09-29',
			status: 'completed',
			notes: 'Saved evaluation notes',
			report_type: '02',
			workflow_status: null,
			created_at: '2025-09-30T01:02:03.654321Z',
			updated_at: '2026-09-29T01:02:03.123456Z'
		};
		ctx.rawStore.seed('rating_scheme_entries', [
			evaluation,
			{ ...evaluation, id: 'foreign-eval', organization_id: 'other-org' }
		]);
		const notification = {
			id: 'own-notification',
			user_id: ctx.auth.userId,
			organization_id: ctx.auth.orgId,
			type: 'member_added',
			title: 'Member added',
			message: 'Saved notification',
			link: '/org/clinic/settings',
			read: true,
			created_at: '2026-09-29T01:02:03.654321Z'
		};
		const feedback = {
			id: 'own-feedback',
			user_id: ctx.auth.userId,
			user_email: 'exporter@example.test',
			organization_id: ctx.auth.orgId,
			organization_name: 'Saved name',
			category: 'bug',
			message: 'Saved feedback',
			page_url: null,
			status: 'reviewed',
			admin_notes: 'Saved review notes',
			created_at: '2026-05-01T00:00:00.123456Z',
			updated_at: '2026-09-29T01:02:03.654321Z',
			github_issue_number: 42,
			github_issue_url: 'https://github.com/example/project/issues/42',
			page_section: 'personnel'
		};
		for (const [table, row] of [
			['notifications', notification],
			['beta_feedback', feedback]
		] as const) {
			ctx.communicationsRows[table] = [
				row,
				{ ...row, id: `peer-${table}`, user_id: 'peer' },
				{ ...row, id: `foreign-${table}`, organization_id: 'other-org' }
			];
		}
		const result = await handleUseCaseRequest(configFor(ctx), ctx, { email: 'owner@example.com' });
		const response = configFor(ctx).formatOutput?.(result);
		expect(response?.status).toBe(200);
		expect(response?.headers.get('Content-Disposition')).toMatch(/^attachment; filename="org-export-test-org-/);
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(await response!.arrayBuffer()));
		const rawRating = workbook.getWorksheet('Raw - Rating Scheme Entries')!;
		const headers = rawRating.getRow(1).values as string[];
		const savedCells = Object.fromEntries(
			headers.slice(1).map((header, index) => [header, rawRating.getRow(2).getCell(index + 1).value ?? null])
		);
		expect(savedCells).toEqual({
			Id: 'own-eval',
			'Organization Id': ctx.auth.orgId,
			'Rated Person Id': 'archived-person',
			'Eval Type': 'OER',
			'Rater Person Id': 'saved-rater',
			'Rater Name': null,
			'Senior Rater Person Id': null,
			'Senior Rater Name': 'LTC External',
			'Intermediate Rater Person Id': null,
			'Intermediate Rater Name': null,
			'Reviewer Person Id': 'saved-reviewer',
			'Reviewer Name': null,
			'Rating Period Start': '2025-09-30',
			'Rating Period End': '2026-09-29',
			Status: 'completed',
			Notes: 'Saved evaluation notes',
			'Report Type': '02',
			'Workflow Status': null,
			'Created At': '2025-09-30T01:02:03.654321Z',
			'Updated At': '2026-09-29T01:02:03.123456Z'
		});
		expect(rawRating.rowCount).toBe(2);
		const rowsInWorkbook = workbook.getWorksheet('Raw - Personnel')!.getSheetValues().flat(2);
		expect(rowsInWorkbook).toContain('own-person');
		expect(rowsInWorkbook).not.toContain('foreign-person');
		for (const [name, row] of [
			['Raw - Notifications', notification],
			['Raw - Beta Feedback', feedback]
		] as const) {
			const sheet = workbook.getWorksheet(name)!;
			expect(sheet.getSheetValues().flat(2)).toEqual(
				expect.arrayContaining(Object.values(row).filter((value) => value !== null))
			);
			expect(sheet.getSheetValues().flat(2)).not.toContain(
				name === 'Raw - Notifications' ? 'peer-notifications' : 'peer-beta_feedback'
			);
			expect(sheet.getSheetValues().flat(2)).not.toContain(
				name === 'Raw - Notifications' ? 'foreign-notifications' : 'foreign-beta_feedback'
			);
		}

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(rows).toHaveLength(12);
		expect(rows.find((row) => row.requested_by === ctx.auth.userId)).toMatchObject({ status: 'completed' });
	});

	it('uses the organization data export policy boundary', () => {
		expect('permission' in configFor(createTestContext())).toBe(false);
		expect(configFor(createTestContext()).policyAction).toBe(POLICY_ACTION_CATALOG.organization.exportData);
		expect(configFor(createTestContext()).policyResource).toEqual({ kind: 'organization' });
	});

	it('allows delegated member managers to export organization workbooks', async () => {
		const ctx = createExportTestContext({
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

		const result = await handleUseCaseRequest(configFor(ctx), ctx, {
			email: 'member-manager@example.com'
		});

		expect(result.status).toBe('ready');
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(readyWorkbookBuffer(result)));
		const rows = workbook.getWorksheet('Raw - Leader Notes')!.getSheetValues().flat(2);
		expect(rows).toContain('own-note');
		expect(rows).not.toContain('foreign-note');
		const inventory = workbook.getWorksheet('Export Inventory')!;
		const inventoryRows = inventory.getSheetValues();
		expect(inventoryRows).toEqual(
			expect.arrayContaining([
				expect.arrayContaining(['personnel_onboardings', 'personnelOnboardings', 0]),
				expect.arrayContaining(['onboarding_step_progress', 'onboardingStepProgress', 0])
			])
		);
		const exportRows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(exportRows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'completed',
				completed_at: expect.any(String),
				file_size_bytes: result.artifact.buffer.byteLength
			})
		]);
		expect(ctx.auditPort.events.filter((event) => event.action.startsWith('export.'))).toEqual([
			expect.objectContaining({
				action: 'export.excel_created',
				resourceType: 'data_export',
				resourceId: exportRows[0].id
			})
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			expect.objectContaining({
				target: 'admins',
				orgId: ctx.auth.orgId,
				excludeUserId: ctx.auth.userId,
				notification: expect.objectContaining({ type: 'bulk_data_exported' })
			})
		]);
	});

	it('includes ETS and PCS / DEROS columns in the personnel worksheet', async () => {
		const ctx = createExportTestContext();
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

		const result = await handleUseCaseRequest(configFor(ctx), ctx, {
			email: 'leader@example.com'
		});
		const response = configFor(ctx).formatOutput?.(result);

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
		const ctx = createExportTestContext();
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

		const result = await handleUseCaseRequest(configFor(ctx), ctx, {
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
		const ctx = createExportTestContext();
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

		const result = await handleUseCaseRequest(configFor(ctx), ctx, {
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
		const ctx = createExportTestContext();
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

		const result = await handleUseCaseRequest(configFor(ctx), ctx, {
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
		const ctx = createExportTestContext();
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

		const result = await handleUseCaseRequest(configFor(ctx), ctx, {
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
