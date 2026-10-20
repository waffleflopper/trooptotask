import { describe, it, expect, vi } from 'vitest';
import { createWriteWithNotificationsPortsContext } from '$lib/server/adapters/inMemory';
import { approveDeletionRequest, denyDeletionRequest } from './reviewDeletionRequest.server';
import { listDeletionRequests } from './deletionRequestReads.server';
import { createDeletionRequestTestStore } from './testing.server';
import { approvePersonnelArchiveRequest } from '$features/personnel/index.server';
import { fail } from '$lib/errors';
import type { ApprovedDeletionEffects } from './contracts.server';
import { projectOrganizationAccessGrant } from '$lib/access/memberAccessProjection';

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

// The workflow fake acknowledges each record approval's pair together. SQL/provider tests own actual atomicity.
function transactionalApproval(ctx: ReturnType<typeof buildContext>, table: string, resourceType: string) {
	return async (requestId: string, id: string, reviewedAt: string) => {
		const before = structuredClone(
			await ctx.store.findOne<Record<string, unknown>>('deletion_requests', ctx.auth.orgId, {
				id: requestId,
				status: 'pending',
				resource_type: resourceType,
				resource_id: id
			})
		);
		const source = await ctx.store.findOne(table, ctx.auth.orgId, { id });
		if (!source) fail(404, 'Deletion target not found');
		if (!before) fail(404, 'Pending deletion request not found');
		await ctx.store.update('deletion_requests', ctx.auth.orgId, requestId, {
			status: 'approved',
			reviewed_by: ctx.auth.userId,
			reviewed_at: reviewedAt,
			denial_reason: null
		});
		try {
			await ctx.store.delete(table, ctx.auth.orgId, id);
		} catch (error) {
			await ctx.store.update('deletion_requests', ctx.auth.orgId, requestId, before);
			throw error;
		}
	};
}

function effectsFor(
	ctx: ReturnType<typeof buildContext>,
	overrides: Partial<ApprovedDeletionEffects> = {}
): ApprovedDeletionEffects {
	return {
		approvePersonnelArchive: (requestId, id, reviewedAt) =>
			approvePersonnelArchiveRequest(ctx, requestId, id, reviewedAt),
		approveTrainingType: transactionalApproval(ctx, 'training_types', 'training_type'),
		approveTrainingRecord: transactionalApproval(ctx, 'personnel_trainings', 'personnel_training'),
		approveRatingEntry: transactionalApproval(ctx, 'rating_scheme_entries', 'rating_scheme_entry'),
		approveCounseling: async (requestId, id, reviewedAt) => {
			await transactionalApproval(ctx, 'counseling_records', 'counseling_record')(requestId, id, reviewedAt);
			return { fileCleanup: 'pending' };
		},
		...overrides
	};
}

describe('approveDeletionRequest', () => {
	it('keeps completion approval pending without success effects when Training deletion fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { resource_type: 'personnel_training', resource_id: 'completion-1' });
		ctx.store.seed('personnel_trainings', [{ id: 'completion-1', organization_id: ctx.auth.orgId }]);
		const trainingDeletion = effectsFor(ctx, {
			approveTrainingRecord: async () => {
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
		const effects = effectsFor(ctx);
		const approveTrainingType = vi.fn(effects.approveTrainingType);

		await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', { ...effects, approveTrainingType });

		expect(approveTrainingType).toHaveBeenCalledWith('dr-1', 'type-1', expect.any(String));
		expect(await ctx.store.findOne('training_types', ctx.auth.orgId, { id: 'type-1' })).toBeNull();
		expect(await ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).toMatchObject({
			status: 'approved'
		});
		expect(ctx.audit.events.map((event) => event.action)).toEqual(['deletion_request.approved']);
		expect(ctx.notifications.notifications).toHaveLength(1);
	});

	it('approves a Training completion deletion while the unit has Training turned off', async () => {
		const auth = projectOrganizationAccessGrant({ role: 'owner' }, 'owner-1', 'test-org', {
			disabledFeatures: ['training']
		});
		const ctx = buildContext({ auth: { ...auth } });
		seedPendingRequest(ctx, { resource_type: 'personnel_training', resource_id: 'completion-1' });
		ctx.store.seed('personnel_trainings', [{ id: 'completion-1', organization_id: 'test-org' }]);

		await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));

		expect(auth.capabilityMap.training).toBe('none');
		expect(await ctx.store.findOne('personnel_trainings', 'test-org', { id: 'completion-1' })).toBeNull();
		expect(await ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).toMatchObject({
			status: 'approved',
			reviewed_by: 'owner-1'
		});
	});

	it('leaves a Training type request pending without success side effects when the owned effect fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { resource_type: 'training_type', resource_id: 'type-1' });
		const approveTrainingType = vi.fn(async () => {
			throw new Error('Training type delete blocked by foreign reference');
		});

		await expect(
			approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx, { approveTrainingType }))
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

		await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));
		if (!ctx.rawStore) throw new Error('Expected raw provider store from the in-memory test context');
		const person = await ctx.rawStore.findOne<{ archived_at: string }>('personnel', ctx.auth.orgId, {
			id: 'person-1'
		});
		expect(person?.archived_at).toEqual(expect.any(String));
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'person-1' })).resolves.toBeNull();
		await expect(ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).resolves.toMatchObject({
			status: 'approved',
			reviewed_at: person?.archived_at
		});
	});

	it('approves a personnel deletion request: updates status, archives personnel, notifies requester, audit logs', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx);

		// Seed the personnel record that will be archived
		ctx.store.seed('personnel', [
			{ id: 'person-1', organization_id: 'test-org', last_name: 'Smith', archived_at: null }
		]);
		ctx.requests.completePendingReview = async () => {
			throw new Error('Unexpected second transition');
		};

		await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));

		// Request status updated to approved
		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({
			status: 'approved',
			reviewed_by: 'test-user'
		});
		expect(request!.reviewed_at).toBeTruthy();

		const person = await ctx.store.findOne<Record<string, unknown>>('personnel', 'test-org', { id: 'person-1' });
		expect(person!.archived_at).toBe(request!.reviewed_at);

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

		await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))).resolves.toEqual({
			fileCleanup: 'pending'
		});

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

		await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))).resolves.toEqual({
			fileCleanup: 'pending'
		});
		await expect(ctx.store.findOne('counseling_records', 'test-org', { id: 'cr-1' })).resolves.toBeNull();
		await expect(ctx.store.findOne('deletion_requests', 'test-org', { id: 'dr-1' })).resolves.toMatchObject({
			status: 'approved'
		});
		expect(ctx.notifications.notifications).toHaveLength(1);
		expect(ctx.audit.events).toHaveLength(1);
	});

	it.each([
		['rejects the command', () => Promise.reject(new Error('archive failed'))],
		[
			'does not acknowledge the command',
			() => Promise.reject(new Error('Personnel archive approval was not acknowledged'))
		]
	])(
		'leaves a Personnel request pending without success effects or retry when the database %s',
		async (_case, reply) => {
			const ctx = buildContext();
			seedPendingRequest(ctx);
			ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', archived_at: null }]);
			const approveArchiveRequest = vi.fn(reply);
			ctx.personnelLifecycle.approveArchiveRequest = approveArchiveRequest;

			await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))).rejects.toThrow();

			expect(approveArchiveRequest).toHaveBeenCalledTimes(1);
			expect(approveArchiveRequest).toHaveBeenCalledWith('dr-1', 'person-1', expect.any(String));
			const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
			expect(request).toMatchObject({ status: 'pending', reviewed_at: null });
			expect(await ctx.store.findOne('personnel', 'test-org', { id: 'person-1' })).toMatchObject({ archived_at: null });
			expect(ctx.notifications.notifications).toEqual([]);
			expect(ctx.audit.events).toEqual([]);
		}
	);

	it.each([
		['belongs to another Organization', 'foreign-org'],
		['is missing', null]
	])('leaves a Personnel request pending when its target %s', async (_case, foreignOrg) => {
		const ctx = buildContext();
		seedPendingRequest(ctx);
		const foreign = { id: 'person-1', organization_id: foreignOrg, archived_at: null };
		if (foreignOrg) ctx.store.seed('personnel', [structuredClone(foreign)]);
		await expect(
			approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))
		).rejects.toMatchObject({ status: 404, message: 'Personnel not found' });
		if (foreignOrg) expect(await ctx.rawStore!.findOne('personnel', foreignOrg, { id: 'person-1' })).toEqual(foreign);
		expect(await ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id: 'dr-1' })).toMatchObject({
			status: 'pending',
			reviewed_by: null,
			reviewed_at: null
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

		await expect(approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx))).resolves.toEqual({
			fileCleanup: 'complete'
		});

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
		ctx.personnelLifecycle.approveArchiveRequest = async () => fail(404, 'Pending deletion request not found');
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
		expect(await ctx.rawStore!.findOne('personnel', 'test-org', { id: 'person-1' })).toMatchObject({
			archived_at: null
		});
	});

	it.each([
		['counseling_record', 'counseling_records'],
		['training_type', 'training_types'],
		['personnel_training', 'personnel_trainings'],
		['rating_scheme_entry', 'rating_scheme_entries']
	])('does not write the status again after a %s approval acknowledges it', async (resourceType, table) => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { resource_type: resourceType, resource_id: 'target-1' });
		ctx.store.seed(table, [{ id: 'target-1', organization_id: 'test-org' }]);
		ctx.requests.completePendingReview = async () => {
			throw new Error('Unexpected second transition');
		};
		await approveDeletionRequest({ ...ctx, store: ctx.requests }, 'dr-1', effectsFor(ctx));
		expect(await ctx.store.findOne(table, 'test-org', { id: 'target-1' })).toBeNull();
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
			ctx.personnelLifecycle.approveArchiveRequest = async () => {
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

describe('canonical saved request identity', () => {
	it.each(['approve', 'deny'] as const)(
		'acknowledges %s using the canonical saved ID for an alternate UUID spelling',
		async (action) => {
			const ctx = buildContext();
			const id = 'abcdef12-3456-4789-abcd-123456789abc';
			seedPendingRequest(ctx, { id, resource_type: 'training_type', resource_id: 'type-1' });
			ctx.store.seed('training_types', [{ id: 'type-1', organization_id: 'test-org' }]);
			const row = await ctx.requests.findPendingById(ctx.auth.orgId, id);
			vi.spyOn(ctx.requests, 'findPendingById').mockResolvedValue(row);
			const effects = effectsFor(ctx);
			const approveTrainingType = vi.fn(effects.approveTrainingType);
			if (action === 'approve')
				await approveDeletionRequest({ ...ctx, store: ctx.requests }, id.toUpperCase(), {
					...effects,
					approveTrainingType
				});
			else await denyDeletionRequest({ ...ctx, store: ctx.requests }, id.toUpperCase(), 'Saved reason');
			expect(await ctx.store.findOne('deletion_requests', ctx.auth.orgId, { id })).toMatchObject({
				status: action === 'approve' ? 'approved' : 'denied'
			});
			if (action === 'approve') expect(approveTrainingType).toHaveBeenCalledWith(id, 'type-1', expect.any(String));
			expect(ctx.audit.events).toContainEqual(
				expect.objectContaining({
					resourceId: id,
					action: action === 'approve' ? 'deletion_request.approved' : 'deletion_request.denied'
				})
			);
			expect(ctx.notifications.notifications).toHaveLength(1);
		}
	);
});
