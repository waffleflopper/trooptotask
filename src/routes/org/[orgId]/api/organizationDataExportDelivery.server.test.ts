import { createSupabaseSignInRosterExportReader } from '$features/sign-in-rosters/index.server';
import { createSupabaseDeletionRequestStore } from '$features/deletion-requests/index.server';
import { createDeletionRequestTestStore } from '$features/deletion-requests/testing.server';
import { describe, expect, it, vi } from 'vitest';
import type { FixtureRowStore } from '$lib/server/adapters/test-support/inMemoryRows.types';
import { createClient } from '@supabase/supabase-js';
import { createRequestOrganizationExportContext } from '$lib/server/adapters/requestContexts.server';
import {
	createTestAuthContext,
	createTestContext,
	createTestOrganizationArchiveReaders
} from '$lib/server/adapters/inMemory';
import { createSupabaseOrganizationRawExportReader } from '$features/organization/index.server';
import { createSupabasePersonnelOrganizationExportPort } from '$features/personnel/index.server';
import { createSupabaseNotificationStore } from '$features/notifications/index.server';
import type { Notification } from '$features/notifications/contracts';
import { listFeedbackExportRows, type FeedbackExportRow } from '$features/feedback/index.server';
import {
	buildOrganizationDataExportWorkbook,
	loadOrganizationExportPayload,
	ORGANIZATION_EXPORT_SECTIONS
} from '$features/data-export/index.server';
import { createOrganizationDataExportReads } from './organizationDataExportDelivery.server';

describe('organization export inventory', () => {
	it('keeps section keys unique and separate from export metadata keys', () => {
		const reservedPayloadKeys = new Set(['exportedAt', 'organizationId', 'sectionInventory', 'sections']);
		const keys = ORGANIZATION_EXPORT_SECTIONS.map((section) => section.key);

		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.filter((key) => reservedPayloadKeys.has(key))).toEqual([]);
	});

	it('starts Organization reads with their batch siblings and caps concurrent reads at twelve', async () => {
		let activeReads = 0;
		let maxActiveReads = 0;
		const started = new Set<string>();
		let batchStarted!: () => void;
		const firstBatchStarted = new Promise<void>((resolve) => {
			batchStarted = resolve;
		});
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const store = {
			async findMany(table: string) {
				started.add(table);
				activeReads += 1;
				maxActiveReads = Math.max(maxActiveReads, activeReads);
				if (activeReads === 12) batchStarted();
				await gate;
				activeReads -= 1;
				return [{ table }];
			}
		} as Pick<FixtureRowStore, 'findMany'> as FixtureRowStore;

		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		const pending = loadOrganizationExportPayload(
			'org-1',
			createOrganizationDataExportReads(
				{
					...ctx,
					archiveReaders: createTestOrganizationArchiveReaders(store, 'org-1'),
					signInRosterExport: { listRows: () => store.findMany('sign_in_rosters', 'org-1') },
					organizationRawExport: { listRows: (orgId, table) => store.findMany(table, orgId) },
					personnelOrganizationExport: { listRows: (actor, table) => store.findMany(table, actor.orgId) },
					notificationSelf: {
						...ctx.notificationSelf,
						store: { ...ctx.notificationSelf.store, listOwnExportRows: () => store.findMany('notifications', 'org-1') }
					},
					feedbackExport: { listRows: (orgId) => store.findMany<FeedbackExportRow>('beta_feedback', orgId) }
				},
				createDeletionRequestTestStore(store)
			)
		);

		await firstBatchStarted;
		for (const table of [
			'organizations',
			'organization_memberships',
			'organization_invitations',
			'organization_invitation_email_outbox',
			'access_request_organization_invitation_links',
			'notifications'
		])
			expect(started.has(table)).toBe(true);
		expect(activeReads).toBe(12);
		release();
		const payload = await pending;
		expect(maxActiveReads).toBeLessThanOrEqual(12);
		expect(payload.organizationProfile).toEqual([{ table: 'organizations' }]);
		expect(payload.memberships).toEqual([{ table: 'organization_memberships' }]);
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
			ctx.auth.orgId,
			createOrganizationDataExportReads(
				{
					...ctx,
					feedbackExport: { listRows: (orgId) => listFeedbackExportRows(client, orgId) }
				},
				createDeletionRequestTestStore(ctx.rawStore)
			)
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

describe('retained Organization export projection', () => {
	it('exports saved identities, historical fields and scoped rows in JSON and workbook sections', async () => {
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
			personnel_document_storage_cap_bytes: 104857600,
			training_readiness_goal_percent: 85
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
			short_label: 'TD',
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

		const onboardingPacket = {
			id: 'saved-packet',
			organization_id: 'org-1',
			personnel_id: 'person-1',
			template_id: null,
			status: 'cancelled',
			started_at: '2026-05-01',
			completed_at: null,
			cancelled_at: '2026-09-29T01:02:03.654321Z',
			created_at: '2026-05-01T00:00:00.123456Z',
			updated_at: '2026-09-29T01:02:03.654321Z'
		};
		const savedPaperwork = {
			id: 'saved-paperwork',
			organization_id: 'org-1',
			onboarding_id: 'saved-packet',
			template_step_id: null,
			step_name: 'Saved paperwork',
			step_type: 'paperwork',
			training_type_id: null,
			stages: ['Submitted', 'Filed'],
			current_stage: 'Retired stage',
			sort_order: 3,
			completed: false,
			active: true,
			notes: [{ text: 'Saved paperwork note', timestamp: '2026-09-29T01:02:03.654321Z', userId: 'saved-author' }],
			created_at: '2026-05-01T00:00:00.123456Z',
			updated_at: '2026-09-29T01:02:03.654321Z'
		};
		const savedTraining = {
			...savedPaperwork,
			id: 'inactive-training',
			step_name: 'Saved Training work',
			step_type: 'training',
			training_type_id: 'training-1',
			stages: null,
			current_stage: null,
			sort_order: 4,
			completed: true,
			active: false,
			notes: [{ text: 'Retained Training note', timestamp: '2026-09-29T01:02:03.654321Z', userId: 'saved-author' }]
		};

		const dashboardConfig = {
			id: 'dashboard-config-1',
			org_id: 'org-1',
			name: null,
			config: { retainedUnknownWidget: { enabled: true, options: null } },
			created_at: '2026-09-01T00:00:00.123456Z',
			future_saved_field: ['preserve', null]
		};

		const additionalSources = [
			{
				key: 'rosterForms',
				table: 'roster_forms',
				areaKey: 'calendar',
				sheet: 'Raw - Roster Forms',
				readableSheet: 'Roster Forms',
				row: {
					id: 'form-saved',
					organization_id: 'org-1',
					assignment_type_id: 'type-1',
					starts_on: '2026-09-01',
					ends_on: '2026-09-30',
					rules: { weekendMode: 'separate', pool: null },
					record: { counts: [{ personnel_id: 'person-1', count: 7 }] },
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'rosterStartingNumbers',
				table: 'roster_starting_numbers',
				areaKey: 'calendar',
				sheet: 'Raw - Roster Starting Numbers',
				readableSheet: 'Roster Starting Numbers',
				row: {
					organization_id: 'org-1',
					form_id: 'form-saved',
					personnel_id: 'person-1',
					track: 'weekend',
					count: 7,
					origin: 'carried'
				}
			},
			{
				key: 'rosterExcusals',
				table: 'roster_excusals',
				areaKey: 'calendar',
				sheet: 'Raw - Roster Excusals',
				readableSheet: 'Roster Excusals',
				row: {
					id: 'excusal-saved',
					organization_id: 'org-1',
					assignment_type_id: 'type-1',
					personnel_id: 'person-1',
					reason: 'Temporary duty',
					starts_on: '2026-09-01',
					ends_on: null,
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'personnelAttributeHistory',
				table: 'personnel_attribute_history',
				areaKey: 'personnel',
				sheet: 'Raw - Personnel Attribute Histo',
				readableSheet: 'Personnel Attribute History',
				row: {
					organization_id: 'org-1',
					personnel_id: 'person-1',
					effective_on: '2026-09-01',
					rank: 'SSG',
					mos: '68V',
					clinic_role: 'Therapist',
					group_id: null,
					archived: true
				}
			},
			{
				key: 'invitations',
				table: 'organization_invitations',
				sheet: 'Raw - Organization Invitations',
				row: {
					id: 'invitation-saved',
					organization_id: 'org-1',
					email: 'invitee@example.test',
					role: 'member',
					invited_by: 'owner-1',
					expires_at: '2026-10-01T00:00:00.123456Z',
					created_at: '2026-09-01T00:00:00.123456Z',
					accepted_at: null
				}
			},
			{
				key: 'invitationEmailOutbox',
				table: 'organization_invitation_email_outbox',
				sheet: 'Raw - Organization Invitation E',
				row: {
					id: 'outbox-saved',
					organization_id: 'org-1',
					invitation_id: 'invitation-saved',
					status: 'sent',
					attempt_count: 2,
					last_error: null,
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'invitationAccessRequestLinks',
				table: 'access_request_organization_invitation_links',
				sheet: 'Raw - Organization Invitation A',
				row: {
					id: 'link-saved',
					organization_id: 'org-1',
					invitation_id: 'invitation-saved',
					access_request_id: 'access-request-saved',
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'organizationRankCatalog',
				table: 'organization_rank_catalog',
				sheet: 'Raw - Organization Rank Catalog',
				row: {
					id: 'rank-saved',
					organization_id: 'org-1',
					rank: 'SGT',
					pay_grade: 'E-5',
					created_at: '2026-09-01T00:00:00.123456Z',
					updated_at: '2026-09-02T00:00:00.654321Z'
				}
			},
			{
				key: 'gettingStartedProgress',
				table: 'getting_started_progress',
				sheet: 'Raw - Getting Started Progress',
				row: {
					id: 'progress-saved',
					organization_id: 'org-1',
					user_id: 'owner-1',
					completed_steps: ['organization', 'personnel'],
					dismissed: false,
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'userOrgPreferences',
				table: 'user_org_preferences',
				sheet: 'Raw - User Organization Prefere',
				row: {
					id: 'preferences-saved',
					organization_id: 'org-1',
					user_id: 'owner-1',
					preferences: { density: 'compact', retained: null },
					updated_at: '2026-09-02T00:00:00.654321Z'
				}
			},
			{
				key: 'userPinnedGroups',
				table: 'user_pinned_groups',
				sheet: 'Raw - User Pinned Groups',
				row: {
					id: 'pin-saved',
					organization_id: 'org-1',
					user_id: 'owner-1',
					group_id: 'group-1',
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'auditLogs',
				table: 'audit_logs',
				sheet: 'Raw - Audit Logs',
				row: {
					id: 'audit-saved',
					org_id: 'org-1',
					user_id: 'owner-1',
					action: 'personnel.updated',
					resource_id: 'person-1',
					details: { previous: null, retained: true },
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'dataExports',
				table: 'data_exports',
				sheet: 'Raw - Data Export Records',
				row: {
					id: 'export-saved',
					org_id: 'org-1',
					requested_by: 'owner-1',
					status: 'completed',
					file_size_bytes: 1234,
					created_at: '2026-09-01T00:00:00.123456Z',
					completed_at: '2026-09-01T00:00:01.654321Z'
				}
			},
			{
				key: 'deletionRequests',
				table: 'deletion_requests',
				sheet: 'Raw - Deletion Requests',
				row: {
					id: 'deletion-saved',
					organization_id: 'org-1',
					requested_by: 'owner-1',
					resource_type: 'personnel',
					resource_id: 'person-1',
					status: 'denied',
					denial_reason: 'Retain record',
					reviewed_at: '2026-09-02T00:00:00.654321Z'
				}
			},
			{
				key: 'counselingRecords',
				table: 'counseling_records',
				sheet: 'Raw - Counseling Records',
				row: {
					id: 'counseling-saved',
					organization_id: 'org-1',
					personnel_id: 'person-1',
					counseling_type: 'performance',
					notes: 'Saved sensitive counseling',
					archived: true,
					file_path: 'org-1/person-1/counseling.pdf',
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'personnelFollowUps',
				table: 'personnel_follow_ups',
				sheet: 'Raw - Personnel Follow-ups',
				row: {
					id: 'follow-up-saved',
					organization_id: 'org-1',
					personnel_id: 'person-1',
					note: 'Saved follow-up',
					completed: false,
					archived: true,
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'personnelDocuments',
				table: 'personnel_documents',
				sheet: 'Raw - Personnel Documents',
				row: {
					id: 'document-saved',
					organization_id: 'org-1',
					personnel_id: 'person-1',
					title: 'Saved order',
					file_path: 'org-1/person-1/orders.pdf',
					archived: true,
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'ictTasks',
				table: 'ict_tasks',
				sheet: 'Raw - Critical Tasks',
				row: {
					id: 'task-saved',
					organization_id: 'org-1',
					title: 'Saved critical task',
					description: 'Keep saved meaning',
					archived: true,
					expiration_months: 6,
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'personnelIctCompletions',
				table: 'personnel_ict_completions',
				sheet: 'Raw - Critical Task Completions',
				row: {
					id: 'completion-saved',
					organization_id: 'org-1',
					personnel_id: 'person-1',
					ict_task_id: 'task-saved',
					completion_date: '2026-09-01',
					notes: ['saved'],
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			},
			{
				key: 'ratingSchemeEntries',
				table: 'rating_scheme_entries',
				sheet: 'Raw - Rating Scheme Entries',
				row: {
					id: 'rating-saved',
					organization_id: 'org-1',
					personnel_id: 'person-1',
					status: 'approved',
					rater_name: 'Saved rater',
					created_at: '2026-09-01T00:00:00.123456Z'
				}
			}
		];

		const providerRows: Record<string, Record<string, unknown>[]> = {
			dashboard_configs: [
				dashboardConfig,
				{ ...dashboardConfig, id: 'foreign-dashboard-config', org_id: 'foreign-org' }
			],
			onboarding_templates: [
				onboardingTemplate,
				{ ...onboardingTemplate, id: 'foreign-template', organization_id: 'foreign-org' }
			],
			onboarding_template_steps: [
				onboardingStep,
				{ ...onboardingStep, id: 'foreign-step', organization_id: 'foreign-org' }
			],
			personnel_onboardings: [
				onboardingPacket,
				{ ...onboardingPacket, id: 'foreign-packet', organization_id: 'foreign-org' }
			],
			onboarding_step_progress: [
				savedPaperwork,
				savedTraining,
				{ ...savedPaperwork, id: 'foreign-progress', organization_id: 'foreign-org', current_stage: 'Filed' }
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
			organizations: [profile, { ...profile, id: 'foreign-org', name: 'Private' }],
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
		for (const { table, row } of additionalSources) {
			const scopeColumn = ['data_exports', 'audit_logs'].includes(table) ? 'org_id' : 'organization_id';
			providerRows[table] = [
				row,
				{ ...row, ...('id' in row ? { id: 'foreign-' + row.id } : {}), [scopeColumn]: 'foreign-org' }
			];
		}
		for (const [table, rows] of Object.entries(providerRows)) {
			if (
				table === 'organizations' ||
				rows.some((row) => row.organization_id === 'foreign-org' || row.org_id === 'foreign-org')
			)
				continue;
			const scopeColumn = ['data_exports', 'audit_logs', 'dashboard_configs'].includes(table)
				? 'org_id'
				: 'organization_id';
			rows.push({ ...rows[0], id: 'foreign-' + table, [scopeColumn]: 'foreign-org' });
		}
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
			const scopeColumn =
				table === 'organizations'
					? 'id'
					: ['dashboard_configs', 'data_exports', 'audit_logs'].includes(table)
						? 'org_id'
						: 'organization_id';
			const scope = url.searchParams.get(scopeColumn)?.replace(/^eq\./, '');
			const rows = (providerRows[table] ?? []).filter((row) => row[scopeColumn] === scope);
			const ordering =
				url.searchParams
					.get('order')
					?.split(',')
					.map((term) => term.split('.')[0]) ?? [];
			if (rows.some((row) => ordering.some((column) => !(column in row))))
				return Response.json({ message: 'Unknown ordering column' }, { status: 400 });
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
		const actor = createTestAuthContext({ orgId: 'org-1' });
		const result = await loadOrganizationExportPayload(
			actor.orgId,
			createOrganizationDataExportReads(
				{
					auth: actor,
					disabledFeatures: [],
					archiveReaders: createRequestOrganizationExportContext({
						...createTestContext({ auth: { ...actor } }),
						supabase: client,
						session: null
					}).archiveReaders,
					signInRosterExport: createSupabaseSignInRosterExportReader(client, actor.orgId),
					personnelOrganizationExport: createSupabasePersonnelOrganizationExportPort(() => adminClient),
					organizationRawExport: createSupabaseOrganizationRawExportReader(client),
					notificationSelf: { auth: actor, audit: { log() {} }, store: createSupabaseNotificationStore(client) },
					feedbackExport: { listRows: (orgId) => listFeedbackExportRows(client, orgId) }
				},
				createSupabaseDeletionRequestStore(client)
			)
		);
		const json = JSON.parse(JSON.stringify(result));
		expect(json.organizationId).toBe('org-1');
		for (const { key, table, areaKey, row } of additionalSources) {
			expect(json[key]).toEqual([row]);
			expect(json.sections[key]).toEqual([row]);
			expect(json.sectionInventory).toContainEqual(
				expect.objectContaining({ key, table, rowCount: 1, ...(areaKey ? { areaKey } : {}) })
			);
		}

		expect(json.dashboardConfigs).toEqual([dashboardConfig]);
		expect(json.sections.dashboardConfigs).toEqual([dashboardConfig]);
		expect(json.trainingTypes).toEqual([trainingType]);
		expect(json.onboardingTemplates).toEqual([onboardingTemplate]);
		expect(json.onboardingTemplateSteps).toEqual([onboardingStep]);
		expect(json.sections.onboardingTemplates).toEqual([onboardingTemplate]);
		expect(json.sections.onboardingTemplateSteps).toEqual([onboardingStep]);
		expect(json.personnelOnboardings).toEqual([onboardingPacket]);
		expect(json.onboardingStepProgress).toEqual([savedPaperwork, savedTraining]);
		expect(json.sections.personnelOnboardings).toEqual([onboardingPacket]);
		expect(json.sections.onboardingStepProgress).toEqual([savedPaperwork, savedTraining]);
		expect(json.sectionInventory).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'personnelOnboardings', table: 'personnel_onboardings', rowCount: 1 }),
				expect.objectContaining({ key: 'onboardingStepProgress', table: 'onboarding_step_progress', rowCount: 2 })
			])
		);

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
		expect(json.signInRosters).toEqual([{ id: 'roster-1', organization_id: 'org-1', name: 'Clinic training' }]);
		expect(json.availabilityEntries).toEqual([
			{
				id: 'availability-1',
				organization_id: 'org-1',
				personnel_id: 'person-1',
				status_type_id: 'status-1',
				start_date: '2026-09-20',
				end_date: '2026-09-21'
			}
		]);
		expect(json.memberships).toEqual([
			{ id: 'membership-1', organization_id: 'org-1', user_id: 'owner-1', role: 'owner' }
		]);
		for (const rows of Object.values(json.sections) as Array<Array<Record<string, unknown>>>) {
			expect(rows.filter((row) => String(row.id).startsWith('foreign-'))).toEqual([]);
		}
		const { workbook } = await buildOrganizationDataExportWorkbook({ payload: result });
		for (const { sheet: rawName, readableSheet, row } of additionalSources) {
			for (const name of readableSheet ? [rawName, readableSheet] : [rawName]) {
				const sheet = workbook.getWorksheet(name)!;
				expect(sheet, name).toBeDefined();
				expect(sheet.rowCount, name).toBe(2);
				for (const [key, value] of Object.entries(row)) {
					const cell = sheet.getRow(2).getCell(key).value;
					expect(cell, name + '.' + key).toEqual(
						value !== null && typeof value === 'object' ? JSON.stringify(value) : value
					);
				}
			}
		}

		for (const [name, rawRow] of [
			['Raw - Training Types', trainingType],
			['Raw - Personnel Trainings', trainingCompletion],
			['Raw - Training Views', trainingView],
			['Raw - Onboarding Templates', onboardingTemplate],
			['Raw - Onboarding Template Steps', onboardingStep],
			['Raw - Personnel Onboardings', onboardingPacket]
		] as const) {
			const sheet = workbook.getWorksheet(name)!;
			expect(sheet.columns.map((column) => column.key)).toEqual(Object.keys(rawRow));
			expect(sheet.getRow(2).getCell('id').value).toBe(rawRow.id);
			if ('created_at' in rawRow)
				expect(sheet.getRow(2).getCell('created_at').value).toBe('2026-05-01T00:00:00.123456Z');
			expect(sheet.rowCount).toBe(2);
		}
		const progressSheet = workbook.getWorksheet('Raw - Onboarding Step Progress')!;
		expect(progressSheet.rowCount).toBe(3);
		expect(progressSheet.getRow(2).getCell('id').value).toBe('saved-paperwork');
		expect(progressSheet.getRow(2).getCell('current_stage').value).toBe('Retired stage');
		expect(progressSheet.getRow(2).getCell('stages').value).toBe('["Submitted","Filed"]');
		expect(progressSheet.getRow(2).getCell('notes').value).toBe(JSON.stringify(savedPaperwork.notes));
		expect(String(progressSheet.getRow(2).getCell('template_step_id').value ?? '')).toBe('');
		expect(progressSheet.getRow(3).getCell('id').value).toBe('inactive-training');
		expect(progressSheet.getRow(3).getCell('completed').value).toBe(true);
		expect(progressSheet.getRow(3).getCell('active').value).toBe(false);
		expect(progressSheet.getRow(3).getCell('training_type_id').value).toBe('training-1');
		expect(progressSheet.getRow(3).getCell('notes').value).toBe(JSON.stringify(savedTraining.notes));
		expect(progressSheet.getRow(3).getCell('created_at').value).toBe('2026-05-01T00:00:00.123456Z');
		expect(progressSheet.getRow(3).getCell('updated_at').value).toBe('2026-09-29T01:02:03.654321Z');
		const readableOnboarding = workbook.getWorksheet('Onboarding Progress')!;
		expect(readableOnboarding.getRow(2).getCell('person').value).toBe('Example, Alex');
		expect(readableOnboarding.getRow(2).getCell('status').value).toBe('cancelled');
		expect(readableOnboarding.getRow(2).getCell('started_at').value).toBe('2026-05-01');
		expect(String(readableOnboarding.getRow(2).getCell('completed_at').value ?? '')).toBe('');
		expect(readableOnboarding.getRow(2).getCell('cancelled_at').value).toBe('2026-09-29T01:02:03.654321Z');
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
	});
});

it('omits switched-off sections from JSON and Excel and retains an omission note', async () => {
	const ctx = createTestContext({ disabledFeatures: ['training', 'lossesAndAwards'] });
	ctx.rawStore.seed('personnel_extended_info', [
		{
			id: 'sheet-1',
			organization_id: ctx.auth.orgId,
			personnel_id: 'p1',
			blood_type: 'O+',
			award_tracking_acknowledged_at: '2026-10-01'
		}
	]);
	const readTraining = vi.fn(async () => {
		throw new Error('Training must not be read');
	});
	const reads = createOrganizationDataExportReads(
		{
			...ctx,
			notificationSelf: {
				...ctx.notificationSelf,
				store: { ...ctx.notificationSelf.store, listOwnExportRows: async () => [] }
			},
			archiveReaders: createTestOrganizationArchiveReaders(ctx.rawStore, ctx.auth.orgId),
			organizationRawExport: { listRows: async () => [] },
			personnelOrganizationExport: { listRows: (actor, table) => ctx.rawStore.findMany(table, actor.orgId) },
			signInRosterExport: { listRows: readTraining },
			feedbackExport: { listRows: async () => [] }
		},
		createDeletionRequestTestStore(ctx.rawStore)
	);
	reads.trainingTypes = readTraining;
	const payload = await loadOrganizationExportPayload(ctx.auth.orgId, reads);
	const json = JSON.parse(JSON.stringify(payload));
	expect(json).not.toHaveProperty('trainingTypes');
	expect(json.sections).not.toHaveProperty('personnelTrainings');
	expect(json.sections).not.toHaveProperty('signInRosters');
	expect(json.personnelExtendedInfo).toEqual([
		{ id: 'sheet-1', organization_id: ctx.auth.orgId, personnel_id: 'p1', blood_type: 'O+' }
	]);
	expect(json.notes).toEqual([
		'Training is turned off; its records are not included.',
		'Losses and awards is turned off; award acknowledgements are not included.'
	]);
	const { workbook } = await buildOrganizationDataExportWorkbook({ payload });
	expect(workbook.worksheets.some((sheet) => sheet.name === 'Training Types')).toBe(false);
	const inventory = workbook.getWorksheet('Export Inventory');
	expect(JSON.stringify(inventory?.getSheetValues())).toContain(
		'Training is turned off; its records are not included.'
	);
	expect(readTraining).not.toHaveBeenCalled();
});
