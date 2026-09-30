import {
	listOnboardingTemplateExportRows,
	listOnboardingTemplateStepExportRows
} from '$features/onboarding/index.server';
import { describe, expect, it } from 'vitest';
import type { DataStore } from '../ports';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createTestAuthContext, createTestContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelOrganizationExportPort } from '$features/personnel/index.server';
import { createSupabaseNotificationStore, listNotificationExportRows } from '$features/notifications/index.server';
import type { Notification } from '$features/notifications/contracts';
import { listFeedbackExportRows, type FeedbackExportRow } from '$features/feedback/index.server';
import { buildOrganizationDataExportWorkbook } from './organizationExportWorkbook';
import {
	listTrainingTypeExportRows,
	listTrainingCompletionExportRows,
	listTrainingViewExportRows
} from '$features/training/index.server';

import {
	loadOrganizationExportPayload,
	ORGANIZATION_EXPORT_QUERY_BATCH_SIZE,
	ORGANIZATION_EXPORT_SECTIONS
} from './organizationExport';

const trainingExport = {
	listTrainingTypeExportRows,
	listTrainingCompletionExportRows,
	listTrainingViewExportRows
};

describe('organization export inventory', () => {
	it('keeps section keys unique and separate from export metadata keys', () => {
		const reservedPayloadKeys = new Set(['exportedAt', 'organizationId', 'sectionInventory', 'sections']);
		const keys = ORGANIZATION_EXPORT_SECTIONS.map((section) => section.key);

		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.filter((key) => reservedPayloadKeys.has(key))).toEqual([]);
	});

	it('caps concurrent organization table reads while building the export payload', async () => {
		let activeReads = 0;
		let maxActiveReads = 0;
		let calls = 0;
		const store = {
			async findMany(table: string) {
				calls += 1;
				activeReads += 1;
				maxActiveReads = Math.max(maxActiveReads, activeReads);
				await new Promise((resolve) => setTimeout(resolve, 0));
				activeReads -= 1;
				return [{ table }];
			}
		} as Pick<DataStore, 'findMany'> as DataStore;

		const payload = await loadOrganizationExportPayload(
			store,
			createTestAuthContext({ orgId: 'org-1' }),
			{
				listRows: (actor, table) => store.findMany(table, actor.orgId)
			},
			trainingExport,
			{ listOnboardingTemplateExportRows, listOnboardingTemplateStepExportRows },
			{
				listNotificationExportRows: () => store.findMany('notifications', 'org-1'),
				listFeedbackExportRows: () => store.findMany<FeedbackExportRow>('beta_feedback', 'org-1')
			}
		);

		expect(calls).toBe(ORGANIZATION_EXPORT_SECTIONS.length);
		expect(maxActiveReads).toBeLessThanOrEqual(ORGANIZATION_EXPORT_QUERY_BATCH_SIZE);
		expect(payload.sectionInventory.length).toBe(ORGANIZATION_EXPORT_SECTIONS.length);
		expect(payload.sectionInventory[0]).toHaveProperty('areaKey');
		expect(typeof payload.sectionInventory[0]?.areaKey).toBe('string');
	});
});

function communicationsProvider(platformAdministrator = false) {
	const notification: Notification = {
		id: 'notification-0',
		user_id: 'exporter',
		organization_id: 'org-1',
		type: 'member_added',
		title: 'Member added',
		message: 'Saved notification',
		link: null,
		read: false,
		created_at: '2026-09-29T01:02:03.654321Z'
	};
	const feedback: FeedbackExportRow = {
		id: 'feedback-0',
		user_id: 'exporter',
		user_email: 'exporter@example.test',
		organization_id: 'org-1',
		organization_name: 'Saved Organization name',
		category: 'bug',
		message: 'Saved feedback',
		page_url: null,
		status: 'new',
		admin_notes: null,
		created_at: '2026-05-01T00:00:00.123456Z',
		updated_at: '2026-09-29T01:02:03.654321Z',
		github_issue_number: null,
		github_issue_url: null,
		page_section: null
	};
	const notifications = Array.from({ length: 1001 }, (_, index) => ({ ...notification, id: `notification-${index}` }));
	const feedbackRows = Array.from({ length: 1001 }, (_, index) => ({ ...feedback, id: `feedback-${index}` }));
	notifications[1000] = { ...notifications[1000], read: true, link: '/org/clinic/settings' };
	feedbackRows[1000] = {
		...feedbackRows[1000],
		status: 'resolved',
		admin_notes: 'Saved review notes',
		page_url: '/org/clinic/personnel',
		github_issue_number: 42,
		github_issue_url: 'https://github.com/example/project/issues/42',
		page_section: 'personnel'
	};
	const rows: Record<string, Record<string, unknown>[]> = {
		notifications: [
			...notifications,
			{ ...notification, id: 'peer-notification', user_id: 'peer' },
			{ ...notification, id: 'foreign-notification', organization_id: 'org-2' }
		],
		beta_feedback: [
			...feedbackRows,
			{ ...feedback, id: 'peer-feedback', user_id: 'peer' },
			{ ...feedback, id: 'foreign-feedback', organization_id: 'org-2' }
		]
	};
	const state = { failTable: null as string | null };
	const client = createClient('http://127.0.0.1:9', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input) => {
				const url = new URL(String(input));
				const table = url.pathname.split('/').at(-1)!;
				if (!(table in rows)) throw new Error('Unexpected communications provider table');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.failTable === table && offset >= 1000) {
					return Response.json({ code: '42501', message: 'retained rows unavailable' }, { status: 403 });
				}
				const visible = rows[table].filter(
					(row) =>
						(row.user_id === 'exporter' || (table === 'beta_feedback' && platformAdministrator)) &&
						(!url.searchParams.has('organization_id') ||
							url.searchParams.get('organization_id') === `eq.${row.organization_id}`) &&
						(!url.searchParams.has('user_id') || url.searchParams.get('user_id') === `eq.${row.user_id}`)
				);
				const limit = Number(url.searchParams.get('limit') ?? 1000);
				const selection = url.searchParams.get('select');
				return Response.json(
					visible
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
	const ctx = createTestContext({ auth: { userId: 'exporter', orgId: 'org-1' } });
	ctx.notificationSelf.store = createSupabaseNotificationStore(client);
	const findMany = ctx.rawStore.findMany.bind(ctx.rawStore);
	ctx.rawStore.findMany = (table, ...args) => {
		if (table === 'notifications' || table === 'beta_feedback')
			throw new Error('Generic communications reads are unavailable');
		return findMany(table, ...args);
	};
	const load = () =>
		loadOrganizationExportPayload(
			ctx.rawStore,
			ctx.auth,
			ctx.personnelOrganizationExport!,
			trainingExport,
			{ listOnboardingTemplateExportRows, listOnboardingTemplateStepExportRows },
			{
				listNotificationExportRows: () => listNotificationExportRows(ctx.notificationSelf),
				listFeedbackExportRows: () => listFeedbackExportRows(client, ctx.auth.orgId)
			}
		);
	return { state, load, notifications, feedbackRows };
}

describe('owned communications in Organization exports', () => {
	it('retains every visible saved field and page in JSON and workbook sections while concealing peer/foreign rows', async () => {
		const provider = communicationsProvider();
		const payload = await provider.load();
		const json = JSON.parse(JSON.stringify(payload));
		expect(json.notifications).toEqual(provider.notifications);
		expect(json.betaFeedback).toEqual(provider.feedbackRows);
		expect(json.sections.notifications).toEqual(provider.notifications);
		expect(json.sections.betaFeedback).toEqual(provider.feedbackRows);
		expect(json.sectionInventory).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'notifications', table: 'notifications', rowCount: 1001 }),
				expect.objectContaining({ key: 'betaFeedback', table: 'beta_feedback', rowCount: 1001 })
			])
		);

		const { workbook } = await buildOrganizationDataExportWorkbook({ payload });
		for (const [name, rows] of [
			['Raw - Notifications', provider.notifications],
			['Raw - Beta Feedback', provider.feedbackRows]
		] as const) {
			const sheet = workbook.getWorksheet(name)!;
			expect(sheet.columns.map(({ key }) => key).sort()).toEqual(Object.keys(rows[0]).sort());
			for (const index of [0, 1000]) {
				for (const [key, value] of Object.entries(rows[index])) {
					expect(sheet.getRow(index + 2).getCell(key).value ?? '').toBe(value ?? '');
				}
			}
			expect(sheet.rowCount).toBe(1002);
		}
	});

	it('retains peer Feedback made visible by request Platform-admin RLS while Notifications remain identity-owned', async () => {
		const provider = communicationsProvider(true);
		const payload = await provider.load();

		expect(payload.notifications).toEqual(provider.notifications);
		expect(payload.betaFeedback).toEqual([
			...provider.feedbackRows,
			{ ...provider.feedbackRows[0], id: 'peer-feedback', user_id: 'peer' }
		]);
	});

	it.each(['notifications', 'beta_feedback'])(
		'rejects a late %s provider error instead of exporting a partial section',
		async (table) => {
			const provider = communicationsProvider();
			provider.state.failTable = table;
			await expect(provider.load()).rejects.toThrow(
				table === 'notifications' ? 'retained rows unavailable' : 'Failed to export feedback'
			);
		}
	);
});

// These provider rows specify retained export data independently of the manifest.
describe('retained Organization export projection', () => {
	it.each(['legacy', 'retired'] as const)('exports retained identities with a %s commercial schema', async (schema) => {
		const profile = {
			id: 'org-1',
			name: 'Clinic',
			created_by: 'owner-1',
			created_at: '2026-09-01T00:00:00Z',
			url_slug: 'clinic',
			archive_retention_months: 36,
			suspended_at: '2026-09-19T00:00:00Z',
			critical_tasks_default_expiration_months: 12,
			critical_tasks_expiring_soon_warning_days: 30,
			loss_warning_window_days: 90,
			personnel_document_storage_cap_bytes: 104857600
		};
		const assignment = {
			id: 'assignment-1',
			organization_id: 'org-1',
			date: '2026-09-20',
			assignment_type_id: 'type-1',
			assignee_id: 'person-1',
			assignee_type: 'personnel'
		};
		const groupAssignment = {
			...assignment,
			id: 'assignment-group-1',
			assignment_type_id: 'group-type-1',
			assignee_id: 'group-1',
			assignee_type: 'group'
		};
		const statusType = {
			id: 'status-1',
			organization_id: 'org-1',
			name: 'TDY',
			color: '#4299e1',
			text_color: '#ffffff',
			sort_order: 2,
			created_at: '2026-09-01T00:00:00Z'
		};
		const specialDay = {
			id: 'closure-1',
			organization_id: 'org-1',
			date: '2026-09-20',
			name: 'Clinic stand-down',
			type: 'org-closure',
			created_at: '2026-09-01T00:00:00Z'
		};
		const activeNote = {
			id: 'active-note',
			organization_id: 'org-1',
			personnel_id: 'person-1',
			author: 'original-author',
			text: 'Sensitive active note',
			created_at: '2026-05-01T00:00:00.123456Z',
			archived_at: null
		};
		const archivedNote = {
			...activeNote,
			id: 'archived-note',
			text: 'Sensitive archived note',
			archived_at: '2026-06-01T00:00:00Z'
		};

		const trainingType = {
			id: 'training-1',
			organization_id: 'org-1',
			name: 'Required',
			expiration_months: null,
			is_optional: false,
			exempt_personnel_ids: ['person-1'],
			created_at: '2026-05-01T00:00:00.123456Z'
		};
		const trainingCompletion = {
			id: 'completion-1',
			organization_id: 'org-1',
			personnel_id: 'person-1',
			training_type_id: 'training-1',
			completion_date: null,
			expiration_date: '2026-10-14',
			notes: 'Saved notes',
			certificate_url: null,
			created_at: '2026-05-01T00:00:00.123456Z',
			updated_at: '2026-09-29T01:02:03.654321Z'
		};
		const trainingView = {
			id: 'view-1',
			organization_id: 'org-1',
			name: 'Saved view',
			visible_type_ids: ['training-1'],
			column_order: ['training-1'],
			created_at: '2026-05-01T00:00:00.123456Z'
		};

		const onboardingTemplate = {
			id: 'template-1',
			organization_id: 'org-1',
			name: 'Saved template',
			description: null,
			created_at: '2026-05-01T00:00:00.123456Z'
		};
		const onboardingStep = {
			id: 'step-1',
			organization_id: 'org-1',
			template_id: 'template-1',
			name: 'Paperwork',
			description: null,
			step_type: 'paperwork',
			training_type_id: null,
			stages: ['Submitted', 'Filed'],
			sort_order: 3
		};

		const commercialTables = new Set([
			'organization_billing_snapshots',
			'organization_checkout_attempts',
			'organization_plan_feature_overrides'
		]);
		const providerRows: Record<string, Record<string, unknown>[]> = {
			onboarding_templates: [
				onboardingTemplate,
				{ ...onboardingTemplate, id: 'foreign-template', organization_id: 'foreign-org' }
			],
			onboarding_template_steps: [
				onboardingStep,
				{ ...onboardingStep, id: 'foreign-step', organization_id: 'foreign-org' }
			],
			training_types: [trainingType, { ...trainingType, id: 'foreign-type', organization_id: 'foreign-org' }],
			personnel_trainings: [
				trainingCompletion,
				{ ...trainingCompletion, id: 'foreign-completion', organization_id: 'foreign-org' }
			],
			training_views: [trainingView, { ...trainingView, id: 'foreign-view', organization_id: 'foreign-org' }],
			leader_notes: [activeNote, archivedNote, { ...activeNote, id: 'foreign-note', organization_id: 'foreign-org' }],
			personnel_extended_info: [
				{
					id: 'ext-1',
					organization_id: 'org-1',
					personnel_id: 'person-1',
					leader_notes: 'Obsolete value must not reach Personnel summary'
				}
			],
			organizations: [
				{
					...profile,
					...(schema === 'legacy'
						? {
								tier: 'team',
								stripe_customer_id: 'cus_legacy',
								stripe_subscription_id: 'sub_legacy',
								subscription_status: 'active',
								current_period_end: '2027-01-01',
								gift_tier: 'unit',
								gift_expires_at: '2027-01-01',
								gifted_by: 'gifter'
							}
						: {})
				},
				{ ...profile, id: 'foreign-org', name: 'Private' }
			],
			organization_memberships: [{ id: 'membership-1', organization_id: 'org-1', user_id: 'owner-1', role: 'owner' }],
			daily_assignments: [
				assignment,
				groupAssignment,
				{ ...assignment, id: 'foreign-assignment', organization_id: 'foreign-org' }
			],
			assignment_types: [
				{ id: 'type-1', organization_id: 'org-1', name: 'Clinic lead', assign_to: 'personnel' },
				{ id: 'group-type-1', organization_id: 'org-1', name: 'Clinic team', assign_to: 'group' }
			],
			groups: [{ id: 'group-1', organization_id: 'org-1', name: 'Alpha Group' }],
			status_types: [statusType, { ...statusType, id: 'foreign-status', organization_id: 'foreign-org' }],
			special_days: [specialDay, { ...specialDay, id: 'foreign-closure', organization_id: 'foreign-org' }],
			availability_entries: [
				{
					id: 'availability-1',
					organization_id: 'org-1',
					personnel_id: 'person-1',
					status_type_id: 'status-1',
					start_date: '2026-09-20',
					end_date: '2026-09-21'
				}
			],
			sign_in_rosters: [{ id: 'roster-1', organization_id: 'org-1', name: 'Clinic training' }],
			personnel: [
				{ id: 'person-1', organization_id: 'org-1', first_name: 'Alex', last_name: 'Example', clinic_role: 'Therapist' }
			]
		};
		const fetchRows = async (input: RequestInfo | URL, denySensitive: boolean) => {
			const url = new URL(String(input));
			const table = url.pathname.split('/').at(-1)!;
			if (
				denySensitive &&
				[
					'personnel_extended_info',
					'counseling_records',
					'leader_notes',
					'personnel_follow_ups',
					'personnel_documents'
				].includes(table)
			)
				return Response.json({ message: 'Direct sensitive read denied' }, { status: 403 });
			if (commercialTables.has(table) || /^(duty_|advanced_duty_)/.test(table))
				return Response.json({ message: 'Retired storage is unavailable' }, { status: 404 });
			const scopeColumn = table === 'organizations' ? 'id' : 'organization_id';
			const scope = url.searchParams.get(scopeColumn)?.replace(/^eq\./, '');
			const rows = (providerRows[table] ?? []).filter((row) => row[scopeColumn] === scope);
			const selection = url.searchParams.get('select');
			if (!selection || selection === '*') return Response.json(rows);
			const columns = selection.split(',');
			if (rows.some((row) => columns.some((column) => !(column in row))))
				return Response.json({ message: 'Unknown column' }, { status: 400 });
			return Response.json(rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))));
		};
		const client = createClient('http://export-provider.test', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: (input) => fetchRows(input, true) }
		});
		const adminClient = createClient('http://export-provider.test', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: (input) => fetchRows(input, false) }
		});
		const store = createSupabaseDataStore(client);
		const actor = createTestAuthContext({ orgId: 'org-1' });
		const result = await loadOrganizationExportPayload(
			store,
			actor,
			createSupabasePersonnelOrganizationExportPort(() => adminClient),
			trainingExport,
			{ listOnboardingTemplateExportRows, listOnboardingTemplateStepExportRows },
			{
				listNotificationExportRows: () =>
					listNotificationExportRows({
						auth: actor,
						audit: { log() {} },
						store: createSupabaseNotificationStore(client)
					}),
				listFeedbackExportRows: () => listFeedbackExportRows(client, actor.orgId)
			}
		);
		const json = JSON.parse(JSON.stringify(result));
		expect(json.organizationId).toBe('org-1');
		expect(json.trainingTypes).toEqual([trainingType]);
		expect(json.onboardingTemplates).toEqual([onboardingTemplate]);
		expect(json.onboardingTemplateSteps).toEqual([onboardingStep]);
		expect(json.sections.onboardingTemplates).toEqual([onboardingTemplate]);
		expect(json.sections.onboardingTemplateSteps).toEqual([onboardingStep]);
		expect(json.personnelTrainings).toEqual([trainingCompletion]);
		expect(json.trainingViews).toEqual([trainingView]);
		expect(json.sections.trainingTypes).toEqual([trainingType]);
		expect(json.sections.personnelTrainings).toEqual([trainingCompletion]);
		expect(json.sections.trainingViews).toEqual([trainingView]);
		expect(json.sectionInventory).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'trainingTypes', table: 'training_types', rowCount: 1 }),
				expect.objectContaining({ key: 'personnelTrainings', table: 'personnel_trainings', rowCount: 1 }),
				expect.objectContaining({ key: 'trainingViews', table: 'training_views', rowCount: 1 })
			])
		);
		expect(json.leaderNotes).toEqual([activeNote, archivedNote]);
		expect(json.sections.leaderNotes).toEqual([activeNote, archivedNote]);
		expect(json.sectionInventory).toContainEqual(
			expect.objectContaining({ key: 'leaderNotes', table: 'leader_notes', rowCount: 2 })
		);
		expect(json.organizationProfile).toEqual([profile]);
		expect(json.sections.organizationProfile).toEqual([profile]);
		expect(json.dailyAssignments).toEqual([assignment, groupAssignment]);
		expect(json.statusTypes).toEqual([statusType]);
		expect(json.specialDays).toEqual([specialDay]);
		expect(json.sections.specialDays).toEqual([specialDay]);
		expect(json.signInRosters).toEqual(providerRows.sign_in_rosters);
		expect(json.availabilityEntries).toEqual(providerRows.availability_entries);
		expect(json.memberships).toEqual(providerRows.organization_memberships);
		expect(json.sectionInventory.some((section: { areaKey: string }) => section.areaKey === 'duty-rosters')).toBe(
			false
		);
		for (const key of ['billingSnapshot', 'billingCheckoutAttempts', 'planFeatureOverrides']) {
			expect(json).not.toHaveProperty(key);
			expect(json.sections).not.toHaveProperty(key);
			expect(json.sectionInventory.map((section: { key: string }) => section.key)).not.toContain(key);
		}
		const { workbook } = await buildOrganizationDataExportWorkbook({ payload: result });
		for (const [name, rawRow] of [
			['Raw - Training Types', trainingType],
			['Raw - Personnel Trainings', trainingCompletion],
			['Raw - Training Views', trainingView],
			['Raw - Onboarding Templates', onboardingTemplate],
			['Raw - Onboarding Template Steps', onboardingStep]
		] as const) {
			const sheet = workbook.getWorksheet(name)!;
			expect(sheet.columns.map((column) => column.key)).toEqual(Object.keys(rawRow));
			expect(sheet.getRow(2).getCell('id').value).toBe(rawRow.id);
			if ('created_at' in rawRow)
				expect(sheet.getRow(2).getCell('created_at').value).toBe('2026-05-01T00:00:00.123456Z');
			expect(sheet.rowCount).toBe(2);
		}
		const stepSheet = workbook.getWorksheet('Raw - Onboarding Template Steps')!;
		expect(stepSheet.getRow(2).getCell('stages').value).toBe('["Submitted","Filed"]');
		expect(stepSheet.getRow(2).getCell('sort_order').value).toBe(3);
		expect(String(stepSheet.getRow(2).getCell('training_type_id').value ?? '')).toBe('');
		const completionSheet = workbook.getWorksheet('Raw - Personnel Trainings')!;
		expect(String(completionSheet.getRow(2).getCell('completion_date').value ?? '')).toBe('');
		expect(String(completionSheet.getRow(2).getCell('certificate_url').value ?? '')).toBe('');
		expect(completionSheet.getRow(2).getCell('updated_at').value).toBe('2026-09-29T01:02:03.654321Z');
		expect(workbook.getWorksheet('Raw - Training Views')!.getRow(2).getCell('visible_type_ids').value).toBe(
			'["training-1"]'
		);
		const noteSheet = workbook.getWorksheet('Leader Notes')!;
		expect(noteSheet.getRow(2).getCell('author').value).toBe('original-author');
		expect(noteSheet.getRow(2).getCell('text').value).toBe('Sensitive active note');
		expect(noteSheet.getRow(3).getCell('text').value).toBe('Sensitive archived note');
		expect(workbook.getWorksheet('Raw - Leader Notes')!.getSheetValues().flat(2)).toContain('archived-note');
		expect(workbook.getWorksheet('Raw - Leader Notes')!.getSheetValues().flat(2)).not.toContain('foreign-note');
		expect(String(workbook.getWorksheet('Personnel')!.getRow(2).getCell('leader_notes').value ?? '')).toBe('');
		const profileSheet = workbook.getWorksheet('Raw - Organization Profile')!;
		expect(profileSheet.columns.map((column) => column.key)).toEqual(Object.keys(profile));
		expect(profileSheet.getRow(2).values).toEqual([undefined, ...Object.values(profile).map((value) => value ?? '')]);
		expect(workbook.getWorksheet('Raw - Daily Assignments')!.getSheetValues().flat(2)).toContain('assignment-1');
		expect(workbook.getWorksheet('Raw - Daily Assignments')!.getSheetValues().flat(2)).not.toContain(
			'foreign-assignment'
		);
		const readableAssignments = workbook.getWorksheet('Daily Assignments')!.getSheetValues().flat(2);
		expect(readableAssignments).toContain('Alpha Group');
		expect(readableAssignments).toContain('Example, Alex');
		expect(workbook.getWorksheet('Raw - Status Types')!.columns.map((column) => column.key)).toEqual(
			Object.keys(statusType)
		);
		expect(workbook.getWorksheet('Calendar')!.getSheetValues().flat(2)).toContain('TDY');
		expect(workbook.getWorksheet('Raw - Sign-in Rosters')!.getSheetValues().flat(2)).toContain('roster-1');
		expect(workbook.getWorksheet('Raw - Special Days')!.getSheetValues().flat(2)).toContain('closure-1');
		expect(workbook.getWorksheet('Raw - Special Days')!.getSheetValues().flat(2)).not.toContain('foreign-closure');
		expect(workbook.worksheets.some((sheet) => /duty roster|advanced duty/i.test(sheet.name))).toBe(false);
		for (const table of commercialTables)
			expect(workbook.getWorksheet('Export Inventory')!.getSheetValues().flat(2)).not.toContain(table);
		expect(workbook.worksheets.filter((sheet) => /billing|checkout|feature overrides/i.test(sheet.name))).toEqual([]);
	});
});
