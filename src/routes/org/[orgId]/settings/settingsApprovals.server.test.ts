import { describe, expect, it } from 'vitest';
import { createWriteWithNotificationsPortsContext } from '$lib/server/adapters/inMemory';
import { createDeletionRequestTestStore, savedRequest } from '$features/deletion-requests/testing.server';
import { loadApprovalsSettings } from './settingsApprovals.server';

describe('loadApprovalsSettings', () => {
	it('returns only the pending requests, without requester or resource ids', async () => {
		const ctx = createWriteWithNotificationsPortsContext({ auth: { role: 'admin', orgId: 'org-a' } });
		ctx.store.seed(
			'deletion_requests',
			[
				savedRequest('older', { created_at: '2026-10-01T10:00:00Z' }),
				savedRequest('newer', { created_at: '2026-10-02T10:00:00Z', resource_type: 'personnel' }),
				savedRequest('denied', { status: 'denied', denial_reason: 'No' }),
				savedRequest('approved', { status: 'approved' })
			].map((row) => ({ ...row }))
		);

		const settings = await loadApprovalsSettings({
			auth: ctx.auth,
			audit: ctx.audit,
			store: createDeletionRequestTestStore(ctx.rawStore!)
		});

		expect(settings.pendingRequests).toEqual([
			{
				id: 'newer',
				status: 'pending',
				requested_by_email: 'saved@example.test',
				resource_description: 'Saved description',
				resource_type: 'personnel',
				resource_url: '/org/saved/training',
				created_at: '2026-10-02T10:00:00Z',
				denial_reason: null
			},
			{
				id: 'older',
				status: 'pending',
				requested_by_email: 'saved@example.test',
				resource_description: 'Saved description',
				resource_type: 'training_type',
				resource_url: '/org/saved/training',
				created_at: '2026-10-01T10:00:00Z',
				denial_reason: null
			}
		]);
	});
});
