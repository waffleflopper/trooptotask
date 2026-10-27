import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseNotificationStore } from '$features/notifications/index.server';
import { listFeedbackExportRows } from '$features/feedback/index.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _createPostConfig } from './+server';
import { createDeletionRequestTestStore } from '$features/deletion-requests/testing.server';
const configFor = (ctx: ReturnType<typeof createTestContext>) =>
	_createPostConfig(createDeletionRequestTestStore(ctx.rawStore));

afterEach(() => {
	vi.restoreAllMocks();
});

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
						(!url.searchParams.has('or') ||
							row.organization_id === null ||
							url.searchParams.get('or')?.includes(`organization_id.eq.${row.organization_id},`)) &&
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

function savedDeletionHistory(orgId: string) {
	return (['pending', 'approved', 'denied', 'cancelled'] as const).map((status) => ({
		id: `history-${status}`,
		organization_id: orgId,
		requested_by: 'saved-requester',
		requested_by_email: 'saved-requester@example.test',
		resource_type: 'training_type',
		resource_id: `removed-type-${status}`,
		resource_description: 'Saved removed-source description',
		resource_url: '/org/saved/training',
		status,
		reviewed_by: status === 'approved' || status === 'denied' ? 'saved-reviewer' : null,
		reviewed_at: status === 'approved' || status === 'denied' ? '2026-09-29T01:02:03.123456Z' : null,
		denial_reason: status === 'denied' ? 'Retain the saved reason' : null,
		created_at: '2026-05-01T00:00:00.654321Z'
	}));
}

describe('POST /api/export', () => {
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

			await expect(handleUseCaseRequest(configFor(ctx), ctx, { email: 'owner@example.com' }, () => ctx)).rejects.toBe(
				failure
			);

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

	it.each(['Notifications', 'Feedback'] as const)(
		'fails the export when its owned %s provider has not been bound',
		async (missingProvider) => {
			const ctx = createExportTestContext();
			const unbound = createTestContext();
			if (missingProvider === 'Notifications') ctx.notificationSelf.store = unbound.notificationSelf.store;
			else ctx.feedbackExport = unbound.feedbackExport;

			await expect(
				handleUseCaseRequest(configFor(ctx), ctx, { email: 'owner@example.com' }, () => ctx)
			).rejects.toThrow(missingProvider);

			await expect(ctx.rawStore.findMany('data_exports', ctx.auth.orgId)).resolves.toEqual([
				expect.objectContaining({ status: 'failed' })
			]);
			expect(ctx.notificationPort.notifications).toEqual([]);
		}
	);

	it.each([
		{ label: 'ordinary member', scopeSet: { kind: 'organization' as const }, canManageMembers: false },
		{
			label: 'Group-scoped member',
			scopeSet: { kind: 'groups' as const, groupIds: ['alpha'] },
			canManageMembers: false
		},
		{ label: 'legacy member manager', scopeSet: { kind: 'organization' as const }, canManageMembers: true }
	])('rejects $label without exporting or creating lifecycle records', async ({ scopeSet, canManageMembers }) => {
		const ctx = createExportTestContext({
			auth: { role: 'member', isPrivileged: false, canManageMembers, scopeSet }
		});
		await expect(
			handleUseCaseRequest(configFor(ctx), ctx, { email: 'member@example.com' }, () => ctx)
		).rejects.toMatchObject({
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

	it('downloads scoped saved data and preserves prior export history', async () => {
		const ctx = createExportTestContext();
		const history = savedDeletionHistory(ctx.auth.orgId);
		ctx.rawStore.seed('deletion_requests', [
			...history,
			{ ...history[0], id: 'foreign-request', organization_id: 'other-org' }
		]);
		const previousExport = {
			id: 'previous-export',
			org_id: ctx.auth.orgId,
			created_at: '2026-09-01T00:00:00Z',
			status: 'completed'
		};
		ctx.rawStore.seed('data_exports', [previousExport]);
		ctx.rawStore.seed('personnel', [
			{ id: 'own-person', organization_id: ctx.auth.orgId, first_name: 'Local', last_name: 'Person', rank: 'SGT' },
			{ id: 'foreign-person', organization_id: 'other-org', first_name: 'Private', last_name: 'Foreign', rank: 'SGT' }
		]);
		const trainingType = { id: 'own-type', organization_id: ctx.auth.orgId, name: 'Required', expiration_months: null };
		const training = {
			id: 'own-training',
			organization_id: ctx.auth.orgId,
			personnel_id: 'own-person',
			training_type_id: 'own-type',
			completion_date: null,
			expiration_date: '2026-10-14',
			notes: null,
			certificate_url: null,
			updated_at: '2026-09-29T01:02:03.654321Z'
		};
		const view = { id: 'own-view', organization_id: ctx.auth.orgId, name: 'Saved', visible_type_ids: ['own-type'] };
		for (const [table, row] of [
			['training_types', trainingType],
			['personnel_trainings', training],
			['training_views', view]
		] as const) {
			ctx.rawStore.seed(table, [row, { ...row, id: `foreign-${table}`, organization_id: 'other-org' }]);
		}
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
		const result = await handleUseCaseRequest(configFor(ctx), ctx, { email: 'owner@example.com' }, () => ctx);
		const response = configFor(ctx).formatOutput?.(result);
		expect(response?.status).toBe(200);
		expect(response?.headers.get('Content-Disposition')).toMatch(/^attachment; filename="org-export-test-org-/);
		const payload = await response!.json();
		expect(payload.deletionRequests).toEqual(history);
		expect(payload.sections.deletionRequests).toEqual(history);
		expect(payload.personnel.map((person: { id: string }) => person.id)).toEqual(['own-person']);
		expect(payload.ratingSchemeEntries).toEqual([evaluation]);
		expect(payload.sections.ratingSchemeEntries).toEqual([evaluation]);
		expect(payload.sectionInventory).toContainEqual(
			expect.objectContaining({ key: 'ratingSchemeEntries', table: 'rating_scheme_entries', rowCount: 1 })
		);
		expect(payload.trainingTypes).toEqual([trainingType]);
		expect(payload.personnelTrainings).toEqual([training]);
		expect(payload.trainingViews).toEqual([view]);
		expect(payload.notifications).toEqual([notification]);
		expect(payload.betaFeedback).toEqual([{ ...feedback, admin_notes: null }]);
		expect(payload.sectionInventory).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'notifications', rowCount: 1 }),
				expect.objectContaining({ key: 'betaFeedback', rowCount: 1 })
			])
		);

		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(rows).toHaveLength(2);
		expect(rows.find((row) => row.id === previousExport.id)).toEqual(previousExport);
		expect(rows.find((row) => row.requested_by === ctx.auth.userId)).toMatchObject({ status: 'completed' });
	});

	it('allows admins without feature capabilities to export organization data', async () => {
		const ctx = createExportTestContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
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
		ctx.rawStore.seed('personnel_extended_info', [
			{ id: 'own-detail', organization_id: ctx.auth.orgId, personnel_id: 'p-1' }
		]);
		ctx.rawStore.seed('organization_setup', [
			{
				organization_id: ctx.auth.orgId,
				branch: 'army',
				answers: { training: 'later' },
				prompts: { setup: { never: true } },
				finished_at: null,
				updated_at: '2026-10-27T00:00:00Z'
			},
			{ organization_id: 'other-org', branch: 'navy' }
		]);

		const result = await handleUseCaseRequest(
			configFor(ctx),
			ctx,
			{
				email: 'admin@example.com'
			},
			() => ctx
		);

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected export to be ready');
		const payload = JSON.parse(result.artifact.body);
		expect(payload.leaderNotes.map((row: { id: string }) => row.id)).toEqual(['own-note']);
		expect(payload.personnelExtendedInfo.map((row: { id: string }) => row.id)).toEqual(['own-detail']);
		expect(payload.organizationSetup).toEqual([
			{
				organization_id: ctx.auth.orgId,
				branch: 'army',
				answers: { training: 'later' },
				prompts: { setup: { never: true } },
				finished_at: null,
				updated_at: '2026-10-27T00:00:00Z'
			}
		]);
		expect(payload.personnelOnboardings).toEqual([]);
		expect(payload.onboardingStepProgress).toEqual([]);
		expect(payload.sections.personnelOnboardings).toEqual([]);
		expect(payload.sections.onboardingStepProgress).toEqual([]);
		const exportRows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(exportRows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'completed',
				completed_at: expect.any(String),
				file_size_bytes: new TextEncoder().encode(result.artifact.body).length
			})
		]);
		expect(ctx.auditPort.events.filter((event) => event.action.startsWith('export.'))).toEqual([
			expect.objectContaining({ action: 'export.created', resourceType: 'data_export', resourceId: exportRows[0].id })
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

	it('includes ETS and DEROS in the organization personnel export payload', async () => {
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

		const result = await handleUseCaseRequest(
			configFor(ctx),
			ctx,
			{
				email: 'leader@example.com'
			},
			() => ctx
		);
		const response = configFor(ctx).formatOutput?.(result);

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected export to be ready');
		const payload = JSON.parse(result.artifact.body) as {
			personnel: Array<Record<string, unknown>>;
		};
		const exportRows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);

		expect(payload.personnel).toEqual([
			expect.objectContaining({
				ets: '2027-05-01',
				deros: '2026-11-30'
			})
		]);
		expect(exportRows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'completed'
			})
		]);
		expect(response?.headers.get('Content-Disposition')).toMatch(
			/^attachment; filename="org-export-test-org-\d{4}-\d{2}-\d{2}\.json"$/
		);
	});

	it('includes personnel detail artifact tables in the organization export payload', async () => {
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
				file_path: `${ctx.auth.orgId}/personnel/p-1/documents/orders.pdf`
			}
		]);

		const result = await handleUseCaseRequest(
			configFor(ctx),
			ctx,
			{
				email: 'leader@example.com'
			},
			() => ctx
		);

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected export to be ready');
		const payload = JSON.parse(result.artifact.body) as {
			leaderNotes: Array<Record<string, unknown>>;
			personnelFollowUps: Array<Record<string, unknown>>;
			personnelDocuments: Array<Record<string, unknown>>;
		};

		expect(payload.leaderNotes).toEqual([expect.objectContaining({ id: 'note-1' })]);
		expect(payload.personnelFollowUps).toEqual([expect.objectContaining({ id: 'follow-up-1' })]);
		expect(payload.personnelDocuments).toEqual([expect.objectContaining({ id: 'document-1' })]);
	});

	it('exports archived personnel, saved Calendar assignments, and independent Sign-in Rosters', async () => {
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
				name: 'Clinic coverage'
			}
		]);
		ctx.rawStore.seed('daily_assignments', [
			{
				id: 'assignment-1',
				organization_id: ctx.auth.orgId,
				assignment_type_id: 'type-1',
				assignee_id: 'p-archived',
				date: '2026-05-20'
			}
		]);
		ctx.rawStore.seed('sign_in_rosters', [
			{
				id: 'roster-1',
				organization_id: ctx.auth.orgId,
				name: 'Clinic training'
			}
		]);

		const result = await handleUseCaseRequest(
			configFor(ctx),
			ctx,
			{
				email: 'leader@example.com'
			},
			() => ctx
		);

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected export to be ready');
		const payload = JSON.parse(result.artifact.body) as {
			personnel: Array<Record<string, unknown>>;
			dailyAssignments: Array<Record<string, unknown>>;
			signInRosters: Array<Record<string, unknown>>;
			sectionInventory: Array<Record<string, unknown>>;
			sections: Record<string, Array<Record<string, unknown>>>;
		};

		expect(payload.personnel).toEqual([expect.objectContaining({ id: 'p-archived', archived_at: expect.any(String) })]);
		expect(payload.dailyAssignments).toEqual([expect.objectContaining({ id: 'assignment-1' })]);
		expect(payload.signInRosters).toEqual([expect.objectContaining({ id: 'roster-1' })]);
		expect(payload.sections.dailyAssignments).toEqual(payload.dailyAssignments);
		expect(payload.sectionInventory).toContainEqual(
			expect.objectContaining({ key: 'dailyAssignments', table: 'daily_assignments', rowCount: 1 })
		);
	});

	it('still returns the export payload when the export status write fails', async () => {
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

		const result = await handleUseCaseRequest(
			configFor(ctx),
			ctx,
			{
				email: 'leader@example.com'
			},
			() => ctx
		);

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected export to be ready');
		const payload = JSON.parse(result.artifact.body) as {
			personnel: Array<Record<string, unknown>>;
		};
		const exportRows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('[data-exports] Failed to mark export'),
			expect.any(Error)
		);

		expect(payload.personnel).toEqual([
			expect.objectContaining({
				ets: '2027-05-01',
				deros: '2026-11-30'
			})
		]);
		expect(exportRows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'processing'
			})
		]);
	});
});
