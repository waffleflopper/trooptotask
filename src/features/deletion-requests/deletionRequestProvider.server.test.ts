import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createDeletionRequest } from './createDeletionRequest.server';
import {
	createSupabaseDeletionRequestStore,
	createSupabaseDeletionRequestSubmission
} from './deletionRequestProvider.server';
import { deletionRequestTestProvider, savedRequest } from './deletionRequestTestProvider.server';

const target = { resourceType: 'training_type', resourceId: 'type-own' };
const review = {
	status: 'approved' as const,
	reviewedBy: 'reviewer',
	reviewedAt: '2026-10-02T12:00:00.000Z',
	denialReason: null
};

describe('ordinary deletion request provider', () => {
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

	it('refuses to list a request whose saved status is outside the contract', async () => {
		const provider = deletionRequestTestProvider([Object.assign(savedRequest('stale'), { status: 'withdrawn' })]);
		const store = createSupabaseDeletionRequestStore(provider.client);
		await expect(store.listRequests('org-a', {})).rejects.toThrow('unknown status');
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

function submissionRpc(reply: () => Response) {
	const calls: Array<{ path: string; body: unknown }> = [];
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				calls.push({ path: new URL(request.url).pathname, body: await request.json() });
				return reply();
			}
		}
	});
	return { calls, submissions: createSupabaseDeletionRequestSubmission(() => client) };
}

const submission = {
	requestedBy: 'requester-a',
	requesterEmail: 'created@example.test',
	resourceType: 'personnel',
	resourceId: 'person',
	description: 'Saved archival',
	resourceUrl: null
};
const createdRow = savedRequest('created', { resource_type: 'personnel', resource_id: 'person' });

describe('deletion request submission provider', () => {
	it('submits once through the atomic command with the admitted Organization and requester', async () => {
		const { calls, submissions } = submissionRpc(() => Response.json({ outcome: 'created', request: createdRow }));
		await expect(submissions.submitPending('org-a', submission)).resolves.toEqual({
			outcome: 'created',
			request: createdRow
		});
		expect(calls).toEqual([
			{
				path: '/rest/v1/rpc/submit_deletion_request',
				body: {
					p_organization_id: 'org-a',
					p_requested_by: 'requester-a',
					p_requester_email: 'created@example.test',
					p_resource_type: 'personnel',
					p_resource_id: 'person',
					p_description: 'Saved archival',
					p_resource_url: null
				}
			}
		]);
	});

	it('acknowledges the saved request for a target submitted in another letter case', async () => {
		const saved = savedRequest('created', {
			resource_type: 'personnel',
			resource_id: 'a1b2c3d4-0000-4000-8000-00000000abcd'
		});
		const { submissions } = submissionRpc(() => Response.json({ outcome: 'created', request: saved }));
		await expect(
			submissions.submitPending('org-a', { ...submission, resourceId: 'A1B2C3D4-0000-4000-8000-00000000ABCD' })
		).resolves.toEqual({ outcome: 'created', request: saved });
	});

	it('reports a pending duplicate as 409 without success audit or notification', async () => {
		const ctx = createTestContext();
		const { calls, submissions } = submissionRpc(() => Response.json({ outcome: 'duplicate' }));
		await expect(
			createDeletionRequest(
				{ ...ctx, store: submissions },
				{
					resourceType: 'personnel',
					resourceId: 'person',
					resourceDescription: 'Saved person',
					userEmail: 'member@example.test'
				}
			)
		).rejects.toMatchObject({ status: 409 });
		expect(calls).toHaveLength(1);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it.each([
		['no reply', null],
		['an unknown outcome', { outcome: 'saved' }],
		['a created outcome without its request', { outcome: 'created' }],
		[
			'a request for another Organization',
			{ outcome: 'created', request: { ...createdRow, organization_id: 'org-b' } }
		],
		['a request for another target', { outcome: 'created', request: { ...createdRow, resource_id: 'other' } }],
		['a request from another requester', { outcome: 'created', request: { ...createdRow, requested_by: 'peer' } }],
		['a terminal request', { outcome: 'created', request: { ...createdRow, status: 'approved' } }]
	])('rejects %s as unacknowledged without success audit, notification or retry', async (_name, reply) => {
		const ctx = createTestContext();
		const { calls, submissions } = submissionRpc(() => Response.json(reply));
		await expect(
			createDeletionRequest(
				{ ...ctx, store: submissions },
				{
					resourceType: 'personnel',
					resourceId: 'person',
					resourceDescription: 'Saved person',
					userEmail: 'member@example.test'
				}
			)
		).rejects.toThrow('Deletion request submission was not acknowledged');
		expect(calls).toHaveLength(1);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('propagates a rejected command without success audit, notification or retry', async () => {
		const ctx = createTestContext();
		const { calls, submissions } = submissionRpc(() =>
			Response.json({ code: '22023', message: 'Invalid deletion request submission' }, { status: 400 })
		);
		await expect(
			createDeletionRequest(
				{ ...ctx, store: submissions },
				{
					resourceType: 'personnel',
					resourceId: 'person',
					resourceDescription: 'Saved person',
					userEmail: 'member@example.test'
				}
			)
		).rejects.toThrow('Invalid deletion request submission');
		expect(calls).toHaveLength(1);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});
});
