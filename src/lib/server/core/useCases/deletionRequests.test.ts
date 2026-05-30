import { describe, it, expect } from 'vitest';
import { createWriteWithNotificationsPortsContext } from '$lib/server/adapters/inMemory';
import {
	createDeletionRequest,
	approveDeletionRequest,
	denyDeletionRequest,
	cancelDeletionRequest,
	listDeletionRequests
} from './deletionRequests';

function buildContext(overrides?: Parameters<typeof createWriteWithNotificationsPortsContext>[0]) {
	return createWriteWithNotificationsPortsContext(overrides);
}

describe('createDeletionRequest', () => {
	const validInput = {
		resourceType: 'counseling_record',
		resourceId: 'rec-1',
		resourceDescription: 'Counseling session with SGT Smith',
		resourceUrl: '/org/test-org/personnel/p-1/counselings',
		userEmail: 'user@example.com'
	};

	it('creates a pending deletion request and audit logs', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});

		await createDeletionRequest(ctx, validInput);

		// Record stored with correct fields
		const stored = await ctx.store.findMany<Record<string, unknown>>('deletion_requests', 'test-org');
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			resource_type: 'counseling_record',
			resource_id: 'rec-1',
			resource_description: 'Counseling session with SGT Smith',
			resource_url: '/org/test-org/personnel/p-1/counselings',
			requested_by: 'test-user',
			requested_by_email: 'user@example.com',
			status: 'pending'
		});

		// Audit logged
		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'deletion_request.created',
			resourceType: 'deletion_request',
			details: {
				subject_type: 'counseling_record',
				subject_id: 'rec-1',
				subject_label: 'Counseling session with SGT Smith'
			}
		});
	});

	it('rejects when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		await expect(createDeletionRequest(ctx, validInput)).rejects.toMatchObject({ status: 403 });
	});

	it('allows personnel archival requests when read-only so organizations can return below limits', async () => {
		const ctx = buildContext({ readOnly: true });

		const created = await createDeletionRequest(ctx, {
			...validInput,
			resourceType: 'personnel',
			resourceId: 'p-1',
			resourceDescription: 'Archive SGT Smith, Jane',
			resourceUrl: '/org/test-org/personnel'
		});

		expect(created).toMatchObject({
			resource_type: 'personnel',
			resource_id: 'p-1',
			status: 'pending'
		});
	});

	it('rejects create when there is no authenticated requester', async () => {
		const ctx = buildContext({ auth: { userId: null } });

		await expect(createDeletionRequest(ctx, validInput)).rejects.toMatchObject({ status: 401 });
	});

	it('allows viewer, operator, editor, and owner/admin requesters through requester-owned policy', async () => {
		for (const auth of [
			{
				userId: 'viewer-user',
				role: 'member' as const,
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view' as const,
					personnel: 'view' as const,
					training: 'view' as const,
					criticalTasks: 'view' as const,
					onboarding: 'view' as const,
					ratingScheme: 'view' as const
				}
			},
			{
				userId: 'operator-user',
				role: 'member' as const,
				isPrivileged: false,
				capabilityMap: {
					calendar: 'operate' as const,
					personnel: 'operate' as const,
					training: 'operate' as const,
					criticalTasks: 'operate' as const,
					onboarding: 'operate' as const,
					ratingScheme: 'operate' as const
				}
			},
			{ userId: 'editor-user', role: 'member' as const, isPrivileged: false, isFullEditor: true },
			{ userId: 'owner-user', role: 'owner' as const, isPrivileged: true }
		]) {
			const ctx = buildContext({ auth });

			await createDeletionRequest(ctx, {
				...validInput,
				resourceId: `${auth.userId}-resource`
			});

			const stored = await ctx.store.findMany<Record<string, unknown>>('deletion_requests', 'test-org');
			expect(stored).toHaveLength(1);
			expect(stored[0]).toMatchObject({ requested_by: auth.userId, status: 'pending' });
		}
	});

	it('notifies admins on create', async () => {
		const ctx = buildContext({ auth: { userId: 'member-user' } });

		await createDeletionRequest(ctx, validInput);

		const notifications = ctx.notifications.notifications;
		expect(notifications).toHaveLength(1);
		expect(notifications[0].target).toBe('admins');
		expect(notifications[0].excludeUserId).toBe('member-user');
		expect(notifications[0].notification.type).toBe('deletion_request_pending');
	});

	it('does not fail creation when admin notification delivery fails', async () => {
		const ctx = buildContext();
		ctx.notifications.notifyAdmins = async () => {
			throw new Error('notification failed');
		};

		await expect(createDeletionRequest(ctx, validInput)).resolves.toMatchObject({
			resource_type: 'counseling_record'
		});

		const stored = await ctx.store.findMany<Record<string, unknown>>('deletion_requests', 'test-org');
		expect(stored).toHaveLength(1);
	});

	it('rejects duplicate pending request for the same resource (409)', async () => {
		const ctx = buildContext();

		// Seed an existing pending request for the same resource
		ctx.store.seed('deletion_requests', [
			{
				id: 'existing-1',
				organization_id: 'test-org',
				resource_type: 'counseling_record',
				resource_id: 'rec-1',
				status: 'pending',
				requested_by: 'other-user'
			}
		]);

		await expect(createDeletionRequest(ctx, validInput)).rejects.toMatchObject({ status: 409 });

		// No new record created
		const stored = await ctx.store.findMany<Record<string, unknown>>('deletion_requests', 'test-org');
		expect(stored).toHaveLength(1);
	});

	it('allows Rating Scheme deletion requests through Rating Scheme policy decisions without Personnel access', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				requireEdit(area: string) {
					if (area === 'personnel') {
						throw new Error('legacy Personnel edit should not authorize Rating Scheme deletion requests');
					}
				},
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'configure'
				}
			}
		});
		ctx.store.seed('rating_scheme_entries', [
			{
				id: 'rs-1',
				organization_id: 'test-org',
				rated_person_id: 'person-1',
				eval_type: 'OER',
				status: 'draft'
			}
		]);

		await expect(
			createDeletionRequest(ctx, {
				resourceType: 'rating_scheme_entry',
				resourceId: 'rs-1',
				resourceDescription: 'SGT Smith OER',
				resourceUrl: '/org/test-org/evals',
				userEmail: 'operator@example.com'
			})
		).resolves.toMatchObject({
			resource_type: 'rating_scheme_entry',
			resource_id: 'rs-1',
			status: 'pending'
		});
	});
});

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
			...overrides
		}
	]);
}

describe('approveDeletionRequest', () => {
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

		await approveDeletionRequest(ctx, 'dr-1');

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

		await expect(approveDeletionRequest(ctx, 'dr-1')).rejects.toMatchObject({ status: 400 });
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

		await approveDeletionRequest(ctx, 'dr-1');

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

	it('does not fail approval when requester notification delivery fails', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx);
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', archived_at: null }]);
		ctx.notifications.notifyUser = async () => {
			throw new Error('notification failed');
		};

		await expect(approveDeletionRequest(ctx, 'dr-1')).resolves.toBeUndefined();

		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({ status: 'approved' });
	});

	it('skips requester notification when requested_by is null', async () => {
		const ctx = buildContext();
		seedPendingRequest(ctx, { requested_by: null });
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', archived_at: null }]);

		await approveDeletionRequest(ctx, 'dr-1');

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

		await expect(approveDeletionRequest(ctx, 'dr-1')).rejects.toMatchObject({ status: 403 });
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

		await denyDeletionRequest(ctx, 'dr-1', 'Not approved by commander');

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

		await expect(denyDeletionRequest(ctx, 'dr-1', 'No')).resolves.toBeUndefined();

		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({ status: 'denied' });
	});
});

describe('cancelDeletionRequest', () => {
	it('allows original requester to cancel their pending request', async () => {
		const ctx = buildContext({ auth: { userId: 'requester-user' } });
		seedPendingRequest(ctx);

		await cancelDeletionRequest(ctx, 'dr-1');

		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({ status: 'cancelled' });

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'deletion_request.cancelled',
			resourceType: 'deletion_request',
			resourceId: 'dr-1'
		});
	});

	it('rejects cancel from a different user', async () => {
		const ctx = buildContext({ auth: { userId: 'different-user' } });
		seedPendingRequest(ctx);

		await expect(cancelDeletionRequest(ctx, 'dr-1')).rejects.toMatchObject({ status: 403 });

		// Status unchanged
		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request!.status).toBe('pending');
	});

	it('lets read-only overlays block requester-owned cancellation', async () => {
		const ctx = buildContext({ auth: { userId: 'requester-user' }, readOnly: true });
		seedPendingRequest(ctx);

		await expect(cancelDeletionRequest(ctx, 'dr-1')).rejects.toMatchObject({ status: 403 });

		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({ status: 'pending' });
	});
});

describe('governance policy guards', () => {
	it('approve rejects non-admin and non-owner users', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				isFullEditor: false
			}
		});
		seedPendingRequest(ctx);

		await expect(approveDeletionRequest(ctx, 'dr-1')).rejects.toMatchObject({ status: 403 });
	});

	it('deny rejects non-admin and non-owner users', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				isFullEditor: false
			}
		});
		seedPendingRequest(ctx);

		await expect(denyDeletionRequest(ctx, 'dr-1')).rejects.toMatchObject({ status: 403 });
	});
});

describe('listDeletionRequests', () => {
	it('returns all requests for privileged users', async () => {
		const ctx = buildContext();
		ctx.store.seed('deletion_requests', [
			{ id: 'dr-1', organization_id: 'test-org', requested_by: 'user-a', status: 'pending' },
			{ id: 'dr-2', organization_id: 'test-org', requested_by: 'user-b', status: 'approved' }
		]);

		const result = await listDeletionRequests(ctx);
		expect(result).toHaveLength(2);
	});

	it('allows governance users to list requests while the organization is read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		ctx.store.seed('deletion_requests', [
			{ id: 'dr-1', organization_id: 'test-org', requested_by: 'user-a', status: 'pending' },
			{ id: 'dr-2', organization_id: 'test-org', requested_by: 'user-b', status: 'approved' }
		]);

		const result = await listDeletionRequests(ctx);
		expect(result).toHaveLength(2);
	});

	it('returns only own requests for non-privileged users', async () => {
		const ctx = buildContext({ auth: { userId: 'user-a', role: 'member', isPrivileged: false } });
		ctx.store.seed('deletion_requests', [
			{ id: 'dr-1', organization_id: 'test-org', requested_by: 'user-a', status: 'pending' },
			{ id: 'dr-2', organization_id: 'test-org', requested_by: 'user-b', status: 'pending' }
		]);

		const result = await listDeletionRequests(ctx);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ id: 'dr-1' });
	});

	it('filters by status when provided', async () => {
		const ctx = buildContext();
		ctx.store.seed('deletion_requests', [
			{ id: 'dr-1', organization_id: 'test-org', requested_by: 'user-a', status: 'pending' },
			{ id: 'dr-2', organization_id: 'test-org', requested_by: 'user-a', status: 'approved' }
		]);

		const result = await listDeletionRequests(ctx, { status: 'pending' });
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ status: 'pending' });
	});
});
