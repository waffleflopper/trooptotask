import { describe, it, expect, vi } from 'vitest';
import { createWriteWithNotificationsPortsContext } from '$lib/server/adapters/inMemory';
import { approveDeletionRequest, denyDeletionRequest } from './reviewDeletionRequest.server';
import { listDeletionRequests } from './deletionRequestReads.server';
import { createDeletionRequestTestStore } from './testing.server';
import { archiveApprovedPersonnelRecord } from '$features/personnel/index.server';
import { fail } from '$lib/errors';
import type { ApprovedDeletionEffects } from './contracts.server';
import type { ApprovedTrainingDeletionPort } from '$features/training/index.server';

function buildContext(overrides?: Parameters<typeof createWriteWithNotificationsPortsContext>[0]) {
	const ctx = createWriteWithNotificationsPortsContext(overrides);
	return { ...ctx, requests: createDeletionRequestTestStore(ctx.store) };
}

function seedPendingRequest(ctx: ReturnType<typeof buildContext>, overrides?: Record<string, unknown>) {
	ctx.store.seed('deletion_requests', [
		{
			id: 'dr-1',
			organization_id: 'test-org',
			resource_type: 'personnel',
			resource_id: 'person-1',
			resource_description: 'SGT Smith',
			resource_url: '/org/test-org/personnel/person-1',
			requested_by: 'requester-user',
			requested_by_email: 'requester@example.com',
			status: 'pending',
			reviewed_by: null,
			reviewed_at: null,
			denial_reason: null,
			created_at: '2026-10-01T12:00:00Z',
			...overrides
		}
	]);
}

function effectsFor(
	ctx: ReturnType<typeof buildContext>,
	training: Partial<ApprovedTrainingDeletionPort> = {}
): ApprovedDeletionEffects {
	return {
		archivePersonnel: (id) => archiveApprovedPersonnelRecord(ctx, id),
		deleteTrainingType: (requestId, id) =>
			training.deleteApprovedTrainingType
				? training.deleteApprovedTrainingType(ctx.auth, requestId, id)
				: ctx.store.deleteWhere('training_types', ctx.auth.orgId, { id }),
		deleteTrainingRecord: (requestId, id) =>
			training.deleteApprovedTrainingRecord
				? training.deleteApprovedTrainingRecord(ctx.auth, requestId, id)
				: ctx.store.deleteWhere('personnel_trainings', ctx.auth.orgId, { id }),
		deleteRatingEntry: (_requestId, id) => ctx.store.deleteWhere('rating_scheme_entries', ctx.auth.orgId, { id }),
		// The workflow fake acknowledges this effect's pair together. SQL/provider tests own actual atomicity.
		approveCounseling: async (requestId, id, reviewedAt) => {
			const before = structuredClone(
				await ctx.store.findOne<Record<string, unknown>>('deletion_requests', ctx.auth.orgId, {
					id: requestId,
					status: 'pending',
					resource_type: 'counseling_record',
					resource_id: id
				})
			);
			const source = await ctx.store.findOne('counseling_records', ctx.auth.orgId, { id });
			if (!before || !source) fail(404, 'Counseling record not found');
			await ctx.store.update('deletion_requests', ctx.auth.orgId, requestId, {
				status: 'approved',
				reviewed_by: ctx.auth.userId,
				reviewed_at: reviewedAt,
				denial_reason: null
			});
			try {
				await ctx.store.delete('counseling_records', ctx.auth.orgId, id);
			} catch (error) {
				await ctx.store.update('deletion_requests', ctx.auth.orgId, requestId, before);
				throw error;
			}
		}
	};
}

describe('approveDeletionRequest', () => {
	it('retries completion approval when its status write fails after the completion was deleted', async () => {
		const ctx = buildContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
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
		seedPendingRequest(ctx, { resource_type: 'personnel_training', resource_id: 'completion-1' });
		ctx.store.seed('personnel_trainings', [
			{ id: 'completion-1', organization_id: ctx.auth.orgId },
			{ id: 'completion-2', organization_id: ctx.auth.orgId }
		]);
		// Production DELETE is idempotent; the shared in-memory delete rejects missing IDs.
		vi.spyOn(ctx.store, 'delete').mockImplementation((table, orgId, id) => ctx.store.deleteWhere(table, orgId, { id }));
		const update = ctx.store.update;
		let failOnce = true;
		vi.spyOn(ctx.store, 'update').mockImplementation(async (table, orgId, id, data, select) => {
			if (table === 'deletion_requests' && id === 'dr-1' && data.status === 'approved' && failOnce) {
				failOnce = false;
				throw new Error('status write failed');
			}
			return update(table, orgId, id, data, select);
		});

		await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))).rejects.toThrow(
			'status write failed'
		);
		await expect(ctx.store.findOne('personnel_trainings', ctx.auth.orgId, { id: 'completion-1' })).resolves.toBeNull();
		await expect(ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).resolves.toMatchObject({
			status: 'pending'
		});
		expect(ctx.notifications.notifications).toEqual([]);
		expect(ctx.audit.events).toEqual([]);

		await expect(
			approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))
		).resolves.toBeUndefined();
		await expect(ctx.store.findMany('personnel_trainings', ctx.auth.orgId)).resolves.toEqual([
			{ id: 'completion-2', organization_id: ctx.auth.orgId }
		]);
		await expect(ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).resolves.toMatchObject({
			status: 'approved'
		});
		expect(ctx.notifications.notifications).toHaveLength(1);
		expect(ctx.audit.events.map((event) => event.action)).toEqual(['deletion_request.approved']);
	});

	it('keeps completion approval pending without success effects when Training deletion fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { resource_type: 'personnel_training', resource_id: 'completion-1' });
		ctx.store.seed('personnel_trainings', [{ id: 'completion-1', organization_id: ctx.auth.orgId }]);
		const trainingDeletion = effectsFor(ctx, {
			deleteApprovedTrainingRecord: async () => {
				throw new Error('completion delete unavailable');
			}
		});
		await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', trainingDeletion)).rejects.toThrow(
			'completion delete unavailable'
		);
		await expect(
			ctx.store.findOne('personnel_trainings', ctx.auth.orgId, { id: 'completion-1' })
		).resolves.not.toBeNull();
		await expect(ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).resolves.toMatchObject({
			status: 'pending'
		});
		expect(ctx.audit.events).toEqual([]);
		expect(ctx.notifications.notifications).toEqual([]);
	});

	it('approves a Training type deletion for an Organization reviewer without Training configure', async () => {
		const ctx = buildContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
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
		seedPendingRequest(ctx, { resource_type: 'training_type', resource_id: 'type-1' });
		ctx.store.seed('training_types', [{ id: 'type-1', organization_id: ctx.auth.orgId, name: 'CPR' }]);
		const deleteApprovedTrainingType = vi.fn(async (_actor, _requestId, typeId: string) => {
			await ctx.store.delete('training_types', ctx.auth.orgId, typeId);
		});

		await approveDeletionRequest(
			{ ...ctx, store: ctx.requests },
			'dr-1',
			effectsFor(ctx, { deleteApprovedTrainingType })
		);

		expect(deleteApprovedTrainingType).toHaveBeenCalledWith(ctx.auth, 'dr-1', 'type-1');
		expect(await ctx.store.findOne('training_types', ctx.auth.orgId, { id: 'type-1' })).toBeNull();
		expect(await ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).toMatchObject({
			status: 'approved'
		});
		expect(ctx.audit.events.map((event) => event.action)).toEqual(['deletion_request.approved']);
		expect(ctx.notifications.notifications).toHaveLength(1);
	});

	it('leaves a Training type request pending without success side effects when the owned effect fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { resource_type: 'training_type', resource_id: 'type-1' });
		const deleteApprovedTrainingType = vi.fn(async () => {
			throw new Error('Training type delete blocked by foreign reference');
		});

		await expect(
			approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx, { deleteApprovedTrainingType }))
		).rejects.toThrow('Training type delete blocked by foreign reference');
		expect(await ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).toMatchObject({
			status: 'pending'
		});
		expect(ctx.audit.events).toEqual([]);
		expect(ctx.notifications.notifications).toEqual([]);
	});

	it('lets an Organization admin approve a Personnel archive without a Personnel capability', async () => {
		const ctx = buildContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				scopeSet: { kind: 'groups', groupIds: [] },
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
		seedPendingRequest(ctx);
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null }]);
		ctx.store.seed('leader_notes', [
			{ id: 'note-1', organization_id: ctx.auth.orgId, personnel_id: 'person-1', archived_at: null }
		]);

		await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));
		if (!ctx.rawStore) throw new Error('Expected raw provider store from the in-memory test context');
		const person = await ctx.rawStore.findOne<{ archived_at: string }>('personnel', ctx.auth.orgId, {
			id: 'person-1'
		});
		expect(person?.archived_at).toEqual(expect.any(String));
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'person-1' })).resolves.toBeNull();
		await expect(ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-1' })).resolves.toMatchObject({
			archived_at: person?.archived_at
		});
	});

	it('approves a personnel deletion request: updates status, archives personnel, notifies requester, audit logs', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx);

		// Seed the personnel record that will be archived
		ctx.store.seed('personnel', [
			{ id: 'person-1', organization_id: 'test-org', last_name: 'Smith', archived_at: null }
		]);
		ctx.store.seed('personnel_follow_ups', [
			{ id: 'follow-up-1', organization_id: 'test-org', personnel_id: 'person-1', status: 'open', archived_at: null }
		]);
		ctx.store.seed('counseling_records', [
			{ id: 'counseling-1', organization_id: 'test-org', personnel_id: 'person-1', archived_at: null }
		]);
		ctx.store.seed('personnel_documents', [
			{ id: 'document-1', organization_id: 'test-org', personnel_id: 'person-1', archived_at: null }
		]);
		ctx.store.seed('leader_notes', [
			{ id: 'note-1', organization_id: 'test-org', personnel_id: 'person-1', archived_at: null }
		]);

		await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));

		// Request status updated to approved
		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({
			status: 'approved',
			reviewed_by: 'test-user'
		});
		expect(request!.reviewed_at).toBeTruthy();

		// Personnel archived (archived_at set)
		const person = await ctx.store.findOne<Record<string, unknown>>('personnel', 'test-org', { id: 'person-1' });
		expect(person!.archived_at).toBeTruthy();
		await expect(
			ctx.store.findOne<Record<string, unknown>>('personnel_follow_ups', 'test-org', { id: 'follow-up-1' })
		).resolves.toMatchObject({ status: 'archived', archived_at: person!.archived_at });
		await expect(
			ctx.store.findOne<Record<string, unknown>>('counseling_records', 'test-org', { id: 'counseling-1' })
		).resolves.toMatchObject({ archived_at: person!.archived_at });
		await expect(
			ctx.store.findOne<Record<string, unknown>>('personnel_documents', 'test-org', { id: 'document-1' })
		).resolves.toMatchObject({ archived_at: person!.archived_at });
		await expect(
			ctx.store.findOne<Record<string, unknown>>('leader_notes', 'test-org', { id: 'note-1' })
		).resolves.toMatchObject({ archived_at: person!.archived_at });

		// Notification created for the requester
		const notifications = ctx.notifications.notifications;
		expect(notifications).toHaveLength(1);
		expect(notifications[0].target).toBe('user');
		expect(notifications[0].userId).toBe('requester-user');
		expect(notifications[0].notification).toMatchObject({
			type: 'deletion_approved',
			title: 'Archival Approved'
		});

		// Audit logged
		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'deletion_request.approved',
			resourceType: 'deletion_request',
			resourceId: 'dr-1',
			details: {
				reviewer_user_id: 'test-user',
				subject_type: 'personnel',
				subject_id: 'person-1',
				subject_label: 'SGT Smith'
			}
		});
	});

	it('rejects unmapped resource types with 400', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, {
			resource_type: 'unknown_type',
			resource_id: 'x-1',
			resource_description: 'Unknown thing'
		});

		await expect(
			approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))
		).rejects.toMatchObject({ status: 400 });

		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({ status: 'pending' });
		expect(request!.reviewed_at).toBeNull();
	});

	it('hard-deletes non-personnel resources on approval', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, {
			resource_type: 'counseling_record',
			resource_id: 'cr-1',
			resource_description: 'Counseling session'
		});

		// Seed the counseling record
		ctx.store.seed('counseling_records', [{ id: 'cr-1', organization_id: 'test-org', notes: 'Some notes' }]);

		await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));

		// Record hard-deleted (not archived)
		const record = await ctx.store.findOne<Record<string, unknown>>('counseling_records', 'test-org', { id: 'cr-1' });
		expect(record).toBeNull();

		// Notification says "Deletion" not "Archival"
		const notifications = ctx.notifications.notifications;
		expect(notifications[0].notification).toMatchObject({
			type: 'deletion_approved',
			title: 'Deletion Approved'
		});
	});

	it('lets an Organization reviewer without Personnel capability approve a counseling deletion', async () => {
		const ctx = buildContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
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
		seedPendingRequest(ctx, { resource_type: 'counseling_record', resource_id: 'cr-1' });
		ctx.store.seed('counseling_records', [{ id: 'cr-1', organization_id: 'test-org', personnel_id: 'p-1' }]);

		await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));

		expect(await ctx.store.findOne('counseling_records', 'test-org', { id: 'cr-1' })).toBeNull();
		expect(await ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).toMatchObject({
			status: 'approved'
		});
	});

	it('keeps a foreign or missing counseling deletion request pending', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { resource_type: 'counseling_record', resource_id: 'cr-1' });
		ctx.store.seed('counseling_records', [{ id: 'cr-1', organization_id: 'other-org', personnel_id: 'p-1' }]);

		await expect(
			approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))
		).rejects.toMatchObject({ status: 404 });

		expect(await ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).toMatchObject({
			status: 'pending'
		});
		expect(await ctx.store.findOne('counseling_records', 'other-org', { id: 'cr-1' })).not.toBeNull();
		expect(ctx.notifications.notifications).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it('keeps a counseling deletion request pending when its bound effect fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { resource_type: 'counseling_record', resource_id: 'cr-1' });
		ctx.store.seed('counseling_records', [{ id: 'cr-1', organization_id: 'test-org', personnel_id: 'p-1' }]);
		const effects = effectsFor(ctx);
		effects.approveCounseling = async () => {
			throw new Error('Storage remove failed');
		};

		await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effects)).rejects.toThrow(
			'Storage remove failed'
		);
		expect(await ctx.store.findOne('counseling_records', 'test-org', { id: 'cr-1' })).not.toBeNull();
		expect(await ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).toMatchObject({
			status: 'pending'
		});
		expect(ctx.notifications.notifications).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it('can retry counseling approval after the request-status write fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { resource_type: 'counseling_record', resource_id: 'cr-1' });
		ctx.store.seed('counseling_records', [{ id: 'cr-1', organization_id: 'test-org', personnel_id: 'p-1' }]);
		const update = ctx.store.update;
		let failOnce = true;
		ctx.store.update = (async (table, orgId, id, data, select) => {
			if (table === 'deletion_requests' && failOnce) {
				failOnce = false;
				throw new Error('status write failed');
			}
			return update(table, orgId, id, data, select);
		}) as typeof ctx.store.update;

		await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))).rejects.toThrow(
			'status write failed'
		);
		await expect(ctx.store.findOne('counseling_records', 'test-org', { id: 'cr-1' })).resolves.not.toBeNull();
		await expect(ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).resolves.toMatchObject({
			status: 'pending'
		});
		expect(ctx.notifications.notifications).toEqual([]);
		expect(ctx.audit.events).toEqual([]);

		await expect(
			approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))
		).resolves.toBeUndefined();
		await expect(ctx.store.findOne('counseling_records', 'test-org', { id: 'cr-1' })).resolves.toBeNull();
		await expect(ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).resolves.toMatchObject({
			status: 'approved'
		});
		expect(ctx.notifications.notifications).toHaveLength(1);
		expect(ctx.audit.events).toHaveLength(1);
	});

	it('retains the archive event when approval is retried after the status write fails', async () => {
		const ctx = buildContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				scopeSet: { kind: 'groups', groupIds: [] },
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
		seedPendingRequest(ctx);
		ctx.store.seed('personnel', [
			{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null, archived_at: null }
		]);
		ctx.store.seed('leader_notes', [
			{ id: 'note-1', organization_id: ctx.auth.orgId, personnel_id: 'person-1', archived_at: null },
			{
				id: 'note-independent',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				archived_at: '2026-08-01T12:00:00.000Z'
			}
		]);
		const update = ctx.store.update;
		let failStatus = true;
		ctx.store.update = (async (table, orgId, id, data, select) => {
			if (table === 'deletion_requests' && failStatus) {
				failStatus = false;
				throw new Error('approval status unavailable');
			}
			return update(table, orgId, id, data, select);
		}) as typeof ctx.store.update;
		const archivedAt = '2026-09-30T14:00:00.000Z';
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date(archivedAt));
			await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))).rejects.toThrow(
				'approval status unavailable'
			);
			expect(await ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).toMatchObject({
				status: 'pending'
			});
			expect(ctx.notifications.notifications).toEqual([]);
			expect(ctx.audit.events).not.toContainEqual(expect.objectContaining({ action: 'deletion_request.approved' }));
			vi.setSystemTime(new Date('2026-09-30T14:05:00.000Z'));
			await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));
			expect(await ctx.rawStore!.findOne('personnel', ctx.auth.orgId, { id: 'person-1' })).toMatchObject({
				archived_at: archivedAt
			});
			expect(await ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-1' })).toMatchObject({
				archived_at: archivedAt
			});
			expect(await ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).toMatchObject({
				status: 'approved'
			});
			expect(ctx.notifications.notifications).toHaveLength(1);
			expect(await ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-independent' })).toMatchObject({
				archived_at: '2026-08-01T12:00:00.000Z'
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves personnel deletion requests pending when archival fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx);
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', archived_at: null }]);
		const update = ctx.store.update;
		ctx.store.update = (async (table, orgId, id, data, select) => {
			if (table === 'personnel' && id === 'person-1') {
				throw new Error('archive failed');
			}
			return update(table, orgId, id, data, select);
		}) as typeof ctx.store.update;

		await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))).rejects.toThrow(
			'archive failed'
		);

		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({ status: 'pending' });
		expect(request!.reviewed_at).toBeNull();
	});

	it('keeps approval pending without success notification or audit when its note effect fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx);
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', archived_at: null }]);
		ctx.store.seed('leader_notes', [
			{ id: 'note-1', organization_id: 'test-org', personnel_id: 'person-1', archived_at: null }
		]);
		const update = ctx.store.update;
		ctx.store.update = (async (table, orgId, id, data, select) => {
			if (table === 'leader_notes') throw new Error('note archive failed');
			return update(table, orgId, id, data, select);
		}) as typeof ctx.store.update;

		await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))).rejects.toThrow(
			'note archive failed'
		);

		await expect(ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).resolves.toMatchObject({
			status: 'pending'
		});
		await expect(ctx.store.findOne('leader_notes', 'test-org', { id: 'note-1' })).resolves.toMatchObject({
			archived_at: null
		});
		// The existing cascade is not transactional: its earlier parent write persists.
		await expect(ctx.store.findOne('personnel', 'test-org', { id: 'person-1' })).resolves.toMatchObject({
			archived_at: expect.any(String)
		});
		expect(ctx.notifications.notifications).toEqual([]);
		expect(ctx.audit.events).not.toContainEqual(expect.objectContaining({ action: 'deletion_request.approved' }));
		const original = structuredClone(
			await ctx.rawStore!.findOne<{ archived_at: string }>('personnel', ctx.auth.orgId, {
				id: 'person-1'
			})
		);
		ctx.store.update = update;
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date('2026-10-01T14:00:00.000Z'));
			await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));
			expect(await ctx.rawStore!.findOne('personnel', ctx.auth.orgId, { id: 'person-1' })).toEqual(original);
			expect(await ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-1' })).toMatchObject({
				archived_at: original!.archived_at
			});
			expect(await ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).toMatchObject({
				status: 'approved'
			});
			expect(ctx.notifications.notifications).toHaveLength(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves a Personnel request pending when its target belongs to another Organization', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx);
		const foreign = { id: 'person-1', organization_id: 'foreign-org', archived_at: null };
		ctx.store.seed('personnel', [structuredClone(foreign)]);
		await expect(
			approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))
		).rejects.toMatchObject({ status: 404 });
		expect(await ctx.rawStore!.findOne('personnel', 'foreign-org', { id: 'person-1' })).toEqual(foreign);
		expect(await ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).toMatchObject({
			status: 'pending'
		});
		expect(ctx.notifications.notifications).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it('leaves non-personnel deletion requests pending when hard delete fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, {
			resource_type: 'counseling_record',
			resource_id: 'cr-1',
			resource_description: 'Counseling session'
		});
		ctx.store.seed('counseling_records', [{ id: 'cr-1', organization_id: 'test-org', notes: 'Some notes' }]);
		const deleteRecord = ctx.store.delete;
		ctx.store.delete = (async (table, orgId, id) => {
			if (table === 'counseling_records' && id === 'cr-1') {
				throw new Error('delete failed');
			}
			return deleteRecord(table, orgId, id);
		}) as typeof ctx.store.delete;

		await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))).rejects.toThrow(
			'delete failed'
		);

		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({ status: 'pending' });
		expect(request!.reviewed_at).toBeNull();
	});

	it('does not fail approval when requester notification delivery fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx);
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', archived_at: null }]);
		ctx.notifications.notifyUser = async () => {
			throw new Error('notification failed');
		};

		await expect(
			approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))
		).resolves.toBeUndefined();

		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({ status: 'approved' });
	});

	it('skips requester notification when requested_by is null', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { requested_by: null });
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', archived_at: null }]);

		await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));

		expect(ctx.notifications.notifications).toHaveLength(0);
	});

	it('rejects approval through governance policy for ordinary members even with feature configure capability', async () => {
		const ctx = buildContext({
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
				}
			}
		});
		seedPendingRequest(ctx);

		await expect(
			approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.audit.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'organization',
				details: expect.objectContaining({
					policyAction: 'organization.reviewDeletionRequests',
					reasonCode: 'denied:governance-role'
				})
			})
		]);
	});
});

describe('denyDeletionRequest', () => {
	it('denies a request: updates status, notifies requester with reason, audit logs', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx);

		await denyDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', 'Not approved by commander');

		// Status updated to denied
		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({
			status: 'denied',
			reviewed_by: 'test-user',
			denial_reason: 'Not approved by commander'
		});
		expect(request!.reviewed_at).toBeTruthy();

		// Notification includes denial reason
		const notifications = ctx.notifications.notifications;
		expect(notifications).toHaveLength(1);
		expect(notifications[0].target).toBe('user');
		expect(notifications[0].userId).toBe('requester-user');
		expect(notifications[0].notification).toMatchObject({
			type: 'deletion_denied',
			title: 'Archival Denied'
		});
		expect(notifications[0].notification.message).toContain('Not approved by commander');

		// Audit logged
		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'deletion_request.denied',
			resourceType: 'deletion_request',
			resourceId: 'dr-1',
			details: {
				reviewer_user_id: 'test-user',
				subject_type: 'personnel',
				subject_id: 'person-1',
				subject_label: 'SGT Smith',
				denial_reason: 'Not approved by commander'
			}
		});
	});

	it('does not fail denial when requester notification delivery fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx);
		ctx.notifications.notifyUser = async () => {
			throw new Error('notification failed');
		};

		await expect(denyDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', 'No')).resolves.toBeUndefined();

		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({ status: 'denied' });
	});
});

describe('governance policy guards', () => {
	it('approve rejects non-admin and non-owner users', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false
			}
		});
		seedPendingRequest(ctx);

		await expect(
			approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))
		).rejects.toMatchObject({ status: 403 });
	});

	it('deny rejects non-admin and non-owner users', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false
			}
		});
		seedPendingRequest(ctx);

		await expect(denyDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1')).rejects.toMatchObject({ status: 403 });
	});
});

describe('listDeletionRequests', () => {
	it('returns all requests for privileged users', async () => {
		const ctx = buildContext();
		ctx.store.seed('deletion_requests', [
			{ id: 'dr-1', organization_id: 'test-org', requested_by: 'user-a', status: 'pending' },
			{ id: 'dr-2', organization_id: 'test-org', requested_by: 'user-b', status: 'approved' }
		]);

		const result = await listDeletionRequests({ ...ctx, store: ctx.requests });
		expect(result).toHaveLength(2);
	});

	it('returns only own requests for non-privileged users', async () => {
		const ctx = buildContext({ auth: { userId: 'user-a', role: 'member', isPrivileged: false } });
		ctx.store.seed('deletion_requests', [
			{ id: 'dr-1', organization_id: 'test-org', requested_by: 'user-a', status: 'pending' },
			{ id: 'dr-2', organization_id: 'test-org', requested_by: 'user-b', status: 'pending' }
		]);

		const result = await listDeletionRequests({ ...ctx, store: ctx.requests });
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ id: 'dr-1' });
	});

	it('filters by status when provided', async () => {
		const ctx = buildContext();
		ctx.store.seed('deletion_requests', [
			{ id: 'dr-1', organization_id: 'test-org', requested_by: 'user-a', status: 'pending' },
			{ id: 'dr-2', organization_id: 'test-org', requested_by: 'user-a', status: 'approved' }
		]);

		const result = await listDeletionRequests({ ...ctx, store: ctx.requests }, { status: 'pending' });
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ status: 'pending' });
	});
});

describe('conditional review result', () => {
	it.each(['approve', 'deny'])('rejects an unacknowledged %s transition without success effects', async (action) => {
		const ctx = buildContext();
		seedPendingRequest(ctx);
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', archived_at: null }]);
		ctx.requests.completePendingReview = async () => false;
		const operation =
			action === 'approve'
				? approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))
				: denyDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', 'Preserved draft');
		await expect(operation).rejects.toMatchObject({ status: 404 });
		expect(await ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).toMatchObject({
			status: 'pending'
		});
		expect(ctx.notifications.notifications).toEqual([]);
		expect(ctx.audit.events.some((event) => event.action.startsWith('deletion_request.'))).toBe(false);
		// Approval retains effect-before-status; denial has no source effect.
		expect(await ctx.rawStore!.findOne('personnel', 'test-org', { id: 'person-1' })).toMatchObject({
			archived_at: action === 'approve' ? expect.any(String) : null
		});
	});

	it('preserves a cancellation that wins after approval source effect without claiming effect rollback', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { resource_type: 'training_type', resource_id: 'type-1' });
		ctx.store.seed('training_types', [{ id: 'type-1', organization_id: 'test-org' }]);
		const effects = effectsFor(ctx);
		effects.deleteTrainingType = async () => {
			await ctx.store.delete('training_types', 'test-org', 'type-1');
			await ctx.store.update('deletion_requests', 'test-org', 'dr-1', { status: 'cancelled' });
		};
		await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effects)).rejects.toMatchObject({
			status: 404
		});
		expect(await ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).toMatchObject({
			status: 'cancelled'
		});
		expect(await ctx.store.findOne('training_types', 'test-org', { id: 'type-1' })).toBeNull();
		expect(ctx.audit.events).toEqual([]);
		expect(ctx.notifications.notifications).toEqual([]);
	});

	it('does not perform a second owner status write after acknowledged counseling completion', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { resource_type: 'counseling_record', resource_id: 'cr-1' });
		ctx.store.seed('counseling_records', [{ id: 'cr-1', organization_id: 'test-org' }]);
		ctx.requests.completePendingReview = async () => {
			throw new Error('Unexpected second transition');
		};
		await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));
		expect(await ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).toMatchObject({
			status: 'approved',
			reviewed_by: ctx.auth.userId
		});
		expect(ctx.audit.events.map(({ action }) => action)).toEqual(['deletion_request.approved']);
	});
});

describe('review persistence failure', () => {
	it.each(['approve', 'deny'])(
		'propagates %s status failure without reporting success or changing saved request metadata',
		async (action) => {
			const ctx = buildContext();
			seedPendingRequest(ctx);
			ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', archived_at: null }]);
			const before = structuredClone(await ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' }));
			ctx.requests.completePendingReview = async () => {
				throw new Error('Review status unavailable');
			};
			const operation =
				action === 'approve'
					? approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))
					: denyDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', 'Saved draft');
			await expect(operation).rejects.toThrow('Review status unavailable');
			expect(await ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).toEqual(before);
			expect(ctx.notifications.notifications).toEqual([]);
			expect(ctx.audit.events.some((event) => event.action.startsWith('deletion_request.'))).toBe(false);
		}
	);
});
