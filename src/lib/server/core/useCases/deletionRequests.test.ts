import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort,
	createTestBillingPort,
	createTestStoragePort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import {
	createDeletionRequest,
	approveDeletionRequest,
	denyDeletionRequest,
	cancelDeletionRequest,
	listDeletionRequests
} from './deletionRequests';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
};

function buildContext(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	readOnly?: boolean;
}): TestContext {
	const auditPort = createTestAuditPort();
	const store = createInMemoryDataStore();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext(overrides?.auth),
		audit: auditPort,
		auditPort,
		readOnlyGuard: createTestReadOnlyGuard(overrides?.readOnly ?? false),
		subscription: createTestSubscriptionPort(),
		notifications: createTestNotificationPort(),
		billing: createTestBillingPort(),
		storage: createTestStoragePort()
	};
}

describe('createDeletionRequest', () => {
	const validInput = {
		resourceType: 'counseling_record',
		resourceId: 'rec-1',
		resourceDescription: 'Counseling session with SGT Smith',
		resourceUrl: '/org/test-org/leaders-book/rec-1',
		userEmail: 'user@example.com'
	};

	it('creates a pending deletion request and audit logs', async () => {
		const ctx = buildContext();

		const result = await createDeletionRequest(ctx, validInput);

		// Record stored with correct fields
		const stored = await ctx.store.findMany<Record<string, unknown>>('deletion_requests', 'test-org');
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			resource_type: 'counseling_record',
			resource_id: 'rec-1',
			resource_description: 'Counseling session with SGT Smith',
			resource_url: '/org/test-org/leaders-book/rec-1',
			requested_by: 'test-user',
			requested_by_email: 'user@example.com',
			status: 'pending'
		});

		// Audit logged
		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'deletion_request.created',
			resourceType: 'deletion_request'
		});
	});

	it('rejects when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		await expect(createDeletionRequest(ctx, validInput)).rejects.toMatchObject({ status: 403 });
	});

	it('notifies admins on create', async () => {
		const ctx = buildContext({ auth: { userId: 'member-user' } });
		// Seed admin memberships for notifyAdminsViaStore
		ctx.store.seed('organization_memberships', [
			{ user_id: 'admin-1', organization_id: 'test-org', role: 'owner' },
			{ user_id: 'admin-2', organization_id: 'test-org', role: 'admin' },
			{ user_id: 'member-user', organization_id: 'test-org', role: 'member' }
		]);

		await createDeletionRequest(ctx, validInput);

		// Admin notifications created (excluding the actor)
		const notifications = await ctx.store.findMany<Record<string, unknown>>('notifications', 'test-org');
		expect(notifications).toHaveLength(2);
		expect(notifications.every((n) => n.type === 'deletion_request_pending')).toBe(true);
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
});

function seedPendingRequest(ctx: TestContext, overrides?: Record<string, unknown>) {
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

		// Notification created for the requester
		const notifications = await ctx.store.findMany<Record<string, unknown>>('notifications', 'test-org');
		expect(notifications).toHaveLength(1);
		expect(notifications[0]).toMatchObject({
			user_id: 'requester-user',
			type: 'deletion_approved',
			title: 'Archival Approved'
		});

		// Audit logged
		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'deletion_request.approved',
			resourceType: 'deletion_request',
			resourceId: 'dr-1'
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
		const notifications = await ctx.store.findMany<Record<string, unknown>>('notifications', 'test-org');
		expect(notifications[0]).toMatchObject({
			type: 'deletion_approved',
			title: 'Deletion Approved'
		});
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
		const notifications = await ctx.store.findMany<Record<string, unknown>>('notifications', 'test-org');
		expect(notifications).toHaveLength(1);
		expect(notifications[0]).toMatchObject({
			user_id: 'requester-user',
			type: 'deletion_denied',
			title: 'Archival Denied'
		});
		expect(notifications[0].message as string).toContain('Not approved by commander');

		// Audit logged
		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'deletion_request.denied',
			resourceType: 'deletion_request',
			resourceId: 'dr-1'
		});
	});
});

describe('cancelDeletionRequest', () => {
	it('allows original requester to cancel their pending request', async () => {
		const ctx = buildContext({ auth: { userId: 'requester-user' } });
		seedPendingRequest(ctx);

		await cancelDeletionRequest(ctx, 'dr-1');

		const request = await ctx.store.findOne<Record<string, unknown>>('deletion_requests', 'test-org', { id: 'dr-1' });
		expect(request).toMatchObject({ status: 'cancelled' });

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
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
});

describe('permission guards', () => {
	it('approve rejects non-privileged users', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				requirePrivileged() {
					const e = new Error('Privileged role required');
					(e as unknown as Record<string, unknown>).status = 403;
					throw e;
				}
			}
		});
		seedPendingRequest(ctx);

		await expect(approveDeletionRequest(ctx, 'dr-1')).rejects.toMatchObject({ status: 403 });
	});

	it('deny rejects non-privileged users', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				requirePrivileged() {
					const e = new Error('Privileged role required');
					(e as unknown as Record<string, unknown>).status = 403;
					throw e;
				}
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
