import { describe, it, expect } from 'vitest';
import { createWriteWithNotificationsPortsContext } from '$lib/server/adapters/inMemory';
import { createDeletionRequest } from './createDeletionRequest.server';
import { createDeletionRequestTestStore } from './testing.server';

function buildContext(overrides?: Parameters<typeof createWriteWithNotificationsPortsContext>[0]) {
	const ctx = createWriteWithNotificationsPortsContext(overrides);
	return { ...ctx, requests: createDeletionRequestTestStore(ctx.store) };
}

describe('createDeletionRequest', () => {
	const validInput = {
		resourceType: 'counseling_record' as const,
		resourceId: 'rec-1',
		resourceDescription: 'Counseling session with SGT Smith',
		resourceUrl: '/org/test-org/personnel/p-1/files',
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

		await createDeletionRequest({ ...ctx, store: ctx.requests }, validInput);

		const stored = await ctx.store.findMany<Record<string, unknown>>('deletion_requests', 'test-org');
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			resource_type: 'counseling_record',
			resource_id: 'rec-1',
			resource_description: 'Counseling session with SGT Smith',
			resource_url: '/org/test-org/personnel/p-1/files',
			requested_by: 'test-user',
			requested_by_email: 'user@example.com',
			status: 'pending'
		});

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

	it('creates a pending personnel archival request', async () => {
		const ctx = buildContext();

		const created = await createDeletionRequest(
			{ ...ctx, store: ctx.requests },
			{
				...validInput,
				resourceType: 'personnel',
				resourceId: 'p-1',
				resourceDescription: 'Archive SGT Smith, Jane',
				resourceUrl: '/org/test-org/personnel'
			}
		);

		expect(created).toMatchObject({
			resource_type: 'personnel',
			resource_id: 'p-1',
			status: 'pending'
		});
	});

	it('rejects unknown resource types without creating a request', async () => {
		const ctx = buildContext();

		await expect(
			createDeletionRequest(
				{ ...ctx, store: ctx.requests },
				{
					...validInput,
					resourceType: 'unknown_type' as never,
					resourceId: 'unknown-1',
					resourceDescription: 'Unknown thing'
				}
			)
		).rejects.toMatchObject({ status: 400 });

		const stored = await ctx.store.findMany<Record<string, unknown>>('deletion_requests', 'test-org');
		expect(stored).toHaveLength(0);
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
			{
				userId: 'editor-user',
				role: 'member' as const,
				isPrivileged: false,
				capabilityMap: {
					calendar: 'configure' as const,
					personnel: 'configure' as const,
					training: 'configure' as const,
					criticalTasks: 'configure' as const,
					onboarding: 'configure' as const,
					ratingScheme: 'configure' as const
				}
			},
			{ userId: 'owner-user', role: 'owner' as const, isPrivileged: true }
		]) {
			const ctx = buildContext({ auth });

			await createDeletionRequest(
				{ ...ctx, store: ctx.requests },
				{
					...validInput,
					resourceId: `${auth.userId}-resource`
				}
			);

			const stored = await ctx.store.findMany<Record<string, unknown>>('deletion_requests', 'test-org');
			expect(stored).toHaveLength(1);
			expect(stored[0]).toMatchObject({ requested_by: auth.userId, status: 'pending' });
		}
	});

	it('notifies admins on create', async () => {
		const ctx = buildContext({ auth: { userId: 'member-user' } });

		await createDeletionRequest({ ...ctx, store: ctx.requests }, validInput);

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

		await expect(createDeletionRequest({ ...ctx, store: ctx.requests }, validInput)).resolves.toMatchObject({
			resource_type: 'counseling_record'
		});

		const stored = await ctx.store.findMany<Record<string, unknown>>('deletion_requests', 'test-org');
		expect(stored).toHaveLength(1);
	});

	it('rejects duplicate pending request for the same resource (409)', async () => {
		const ctx = buildContext();

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

		await expect(createDeletionRequest({ ...ctx, store: ctx.requests }, validInput)).rejects.toMatchObject({
			status: 409
		});

		const stored = await ctx.store.findMany<Record<string, unknown>>('deletion_requests', 'test-org');
		expect(stored).toHaveLength(1);
		expect(ctx.audit.events).toEqual([]);
		expect(ctx.notifications.notifications).toEqual([]);
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
			createDeletionRequest(
				{ ...ctx, store: ctx.requests },
				{
					resourceType: 'rating_scheme_entry',
					resourceId: 'rs-1',
					resourceDescription: 'SGT Smith OER',
					resourceUrl: '/org/test-org/evals',
					userEmail: 'operator@example.com'
				}
			)
		).resolves.toMatchObject({
			resource_type: 'rating_scheme_entry',
			resource_id: 'rs-1',
			status: 'pending'
		});
	});
});

describe('creation failure acknowledgement', () => {
	it('propagates persistence failure without success audit or administrator notification', async () => {
		const ctx = buildContext();
		ctx.requests.submitPending = async () => {
			throw new Error('Request creation unavailable');
		};
		await expect(
			createDeletionRequest(
				{ ...ctx, store: ctx.requests },
				{
					resourceType: 'personnel',
					resourceId: 'person',
					resourceDescription: 'Saved description',
					userEmail: 'saved@example.test'
				}
			)
		).rejects.toThrow('Request creation unavailable');
		expect(await ctx.store.findMany('deletion_requests', ctx.auth.orgId)).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
		expect(ctx.notifications.notifications).toEqual([]);
	});
});
