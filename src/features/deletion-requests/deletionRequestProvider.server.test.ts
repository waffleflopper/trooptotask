import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createDeletionRequest } from './createDeletionRequest.server';
import { createSupabaseDeletionRequestStore } from './deletionRequestProvider.server';
import { deletionRequestTestProvider, savedRequest } from './deletionRequestTestProvider.server';

const target = { resourceType: 'training_type', resourceId: 'type-own' };
const review = {
	status: 'approved' as const,
	reviewedBy: 'reviewer',
	reviewedAt: '2026-10-02T12:00:00.000Z',
	denialReason: null
};

describe('ordinary deletion request provider', () => {
	it('rejects creation without changing history when multiple visible pending rows already exist', async () => {
		const ctx = createTestContext({
			auth: { role: 'member', isPrivileged: false, capabilityMap: { personnel: 'operate' } }
		});
		const rows = ['first', 'second'].map((id) =>
			savedRequest(id, {
				organization_id: ctx.auth.orgId,
				requested_by: ctx.auth.userId,
				resource_type: 'personnel',
				resource_id: 'person'
			})
		);
		const provider = deletionRequestTestProvider(rows, ctx.auth.userId);
		const store = createSupabaseDeletionRequestStore(provider.client);
		await expect(
			createDeletionRequest(
				{ ...ctx, store },
				{
					resourceType: 'personnel',
					resourceId: 'person',
					resourceDescription: 'Saved person',
					userEmail: 'member@example.test'
				}
			)
		).rejects.toMatchObject({ status: 409 });
		expect(provider.state.rows).toEqual(rows);
		expect(provider.state.calls.every((request) => request.method === 'GET')).toBe(true);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('propagates a pending-existence provider failure without inserting or reporting success', async () => {
		const ctx = createTestContext();
		const provider = deletionRequestTestProvider();
		provider.state.failure = { method: 'GET', message: 'pending lookup unavailable' };
		await expect(
			createDeletionRequest(
				{ ...ctx, store: createSupabaseDeletionRequestStore(provider.client) },
				{
					resourceType: 'personnel',
					resourceId: 'person',
					resourceDescription: 'Saved person',
					userEmail: 'member@example.test'
				}
			)
		).rejects.toThrow('pending lookup unavailable');
		expect(provider.state.rows).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('returns only an exact matching pending tuple, retaining concealed/foreign/terminal rows', async () => {
		const provider = deletionRequestTestProvider(
			[
				savedRequest('own'),
				savedRequest('peer', { requested_by: 'peer' }),
				savedRequest('foreign', { organization_id: 'org-b' }),
				savedRequest('terminal', { status: 'approved' })
			],
			'requester-a'
		);
		const store = createSupabaseDeletionRequestStore(provider.client);
		expect(await store.findPendingById('org-a', 'own', target)).toEqual(savedRequest('own'));
		for (const id of ['peer', 'foreign', 'terminal', 'missing'])
			expect(await store.findPendingById('org-a', id)).toBeNull();
		expect(await store.findPendingById('org-a', 'own', { ...target, resourceId: 'other' })).toBeNull();
		expect(await store.findPendingById('org-a', 'own', { ...target, resourceType: 'personnel' })).toBeNull();
		expect(await store.findPendingByResource('org-a', 'training_type', 'type-own')).toEqual({ id: 'own' });
		expect(await store.findPendingByResource('org-a', 'training_type', 'type-terminal')).toBeNull();
	});

	it('stores only the creation fields and returns retained requester/history metadata', async () => {
		const provider = deletionRequestTestProvider();
		const store = createSupabaseDeletionRequestStore(provider.client);
		const row = await store.createRequest('org-a', {
			requestedBy: 'requester-a',
			requesterEmail: 'created@example.test',
			resourceType: 'personnel',
			resourceId: 'person',
			description: 'Saved archival',
			resourceUrl: null
		});
		expect(row).toEqual({
			...savedRequest('insert-0'),
			requested_by_email: 'created@example.test',
			resource_type: 'personnel',
			resource_id: 'person',
			resource_description: 'Saved archival',
			resource_url: null
		});
		expect(provider.state.rows).toEqual([row]);
	});

	it('reads every list/export page, preserving all terminal/raw fields and filtering arbitrary statuses', async () => {
		const rows = Array.from({ length: 1002 }, (_, i) => savedRequest(`request-${String(i).padStart(4, '0')}`));
		rows[1001] = savedRequest('request-1001', {
			status: 'denied',
			reviewed_by: 'saved-reviewer',
			reviewed_at: '2026-10-01T10:01:00.654321Z',
			denial_reason: 'Saved denial',
			resource_type: 'historical_unknown',
			resource_url: null
		});
		const provider = deletionRequestTestProvider([
			...rows,
			savedRequest('foreign', { organization_id: 'org-b' }),
			savedRequest('peer', { requested_by: 'peer' })
		]);
		const store = createSupabaseDeletionRequestStore(provider.client);
		expect(await store.listRequests('org-a', { requestedBy: 'requester-a' })).toEqual(rows);
		expect(await store.listRequests('org-a', { status: 'unrecognized-status' })).toEqual([]);
		expect(await store.listRequests('org-a', { status: 'denied' })).toEqual([rows[1001]]);
		expect(await store.listExportRows('org-a')).toEqual([savedRequest('peer', { requested_by: 'peer' }), ...rows]);
	});

	it('counts all pending rows and reads only the oldest date in one request, preserving own visibility', async () => {
		const provider = deletionRequestTestProvider([
			savedRequest('new'),
			savedRequest('old', { created_at: '2026-09-01T10:00:00.123456Z' }),
			savedRequest('peer', { requested_by: 'peer', created_at: '2026-08-01T10:00:00Z' }),
			savedRequest('terminal', { status: 'cancelled', created_at: '2026-07-01T10:00:00Z' }),
			savedRequest('foreign', { organization_id: 'org-b', created_at: '2026-06-01T10:00:00Z' })
		]);
		const store = createSupabaseDeletionRequestStore(provider.client);
		expect(await store.readPendingSummary('org-a', 'requester-a')).toEqual({
			count: 2,
			oldestCreatedAt: '2026-09-01T10:00:00.123456Z'
		});
		// Payload/query budget is part of this consumer's performance requirement.
		expect(provider.state.calls).toHaveLength(1);
		const url = new URL(provider.state.calls[0].url);
		expect(url.searchParams.get('select')).toBe('created_at');
		expect(url.searchParams.get('limit')).toBe('1');
		expect(await store.readPendingSummary('org-a')).toEqual({ count: 3, oldestCreatedAt: '2026-08-01T10:00:00Z' });
		expect(await store.readPendingSummary('org-a', 'missing')).toEqual({ count: 0, oldestCreatedAt: null });
	});

	it('changes only review metadata on the bound pending row and does not overwrite terminal/wrong-target rows', async () => {
		const own = savedRequest('own');
		const foreign = savedRequest('foreign', { organization_id: 'org-b' });
		const provider = deletionRequestTestProvider([own, foreign]);
		const store = createSupabaseDeletionRequestStore(provider.client);
		expect(await store.completePendingReview('org-a', 'own', { ...target, resourceId: 'wrong' }, review)).toBe(false);
		expect(await store.completePendingReview('org-b', 'own', target, review)).toBe(false);
		expect(await store.completePendingReview('org-a', 'own', target, review)).toBe(true);
		expect(provider.state.rows).toEqual([
			{ ...own, status: 'approved', reviewed_by: 'reviewer', reviewed_at: review.reviewedAt, denial_reason: null },
			foreign
		]);
		expect(
			await store.completePendingReview('org-a', 'own', target, {
				...review,
				status: 'denied',
				denialReason: 'too late'
			})
		).toBe(false);
		expect(provider.state.rows[0].status).toBe('approved');
	});

	it.each(['cancelled', 'denied', 'approved'] as const)(
		'does not replace a %s winner observed before the conditional PATCH',
		async (status) => {
			const provider = deletionRequestTestProvider([savedRequest('own')]);
			provider.state.beforePatch = () => {
				provider.state.rows[0].status = status;
			};
			const store = createSupabaseDeletionRequestStore(provider.client);
			expect(await store.completePendingReview('org-a', 'own', target, review)).toBe(false);
			expect(provider.state.rows[0]).toEqual(savedRequest('own', { status }));
		}
	);

	it.each([{}, { id: 'another' }, true].map((reply) => ({ reply })))(
		'rejects malformed review acknowledgement $reply',
		async ({ reply }) => {
			const provider = deletionRequestTestProvider([savedRequest('own')]);
			provider.state.patchReply = reply;
			await expect(
				createSupabaseDeletionRequestStore(provider.client).completePendingReview('org-a', 'own', target, review)
			).rejects.toThrow('not acknowledged');
		}
	);

	it('propagates a later-page read or mutation failure without returning partial success', async () => {
		const provider = deletionRequestTestProvider(Array.from({ length: 1001 }, (_, i) => savedRequest(`request-${i}`)));
		const store = createSupabaseDeletionRequestStore(provider.client);
		provider.state.failure = { method: 'GET', offset: 1000, message: 'later page unavailable' };
		await expect(store.listRequests('org-a', {})).rejects.toThrow('later page unavailable');
		await expect(store.listExportRows('org-a')).rejects.toThrow('later page unavailable');
		provider.state.failure = { method: 'PATCH', message: 'write unavailable' };
		await expect(
			store.completePendingReview(
				'org-a',
				'request-0',
				{ resourceType: 'training_type', resourceId: 'type-request-0' },
				review
			)
		).rejects.toThrow('write unavailable');
		expect(provider.state.rows[0]).toEqual(savedRequest('request-0'));
	});
});
