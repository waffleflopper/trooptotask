import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { createSupabaseApprovedRatingSchemeDeletionPort } from './approvedRatingSchemeDeletion.server';

function reviewer(role: 'admin' | 'member' = 'admin', disabledFeatures: FeatureKey[] = []) {
	const auth = createTestAuthContext({
		orgId: 'org-1',
		userId: 'reviewer-1',
		role,
		isPrivileged: role === 'admin',
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: role === 'admin' ? 'none' : 'configure'
		}
	});
	return { ...auth, disabledFeatures };
}

function provider(error: { code?: string; message: string } | null = null) {
	const rpc = vi.fn(async () => ({ data: null, error }));
	const getAdminClient = vi.fn(() => ({ rpc }) as unknown as SupabaseClient);
	return { rpc, getAdminClient, port: createSupabaseApprovedRatingSchemeDeletionPort(getAdminClient) };
}

describe('approved Rating Scheme deletion', () => {
	it('keeps the request pending while Evaluations is off', async () => {
		const { port, rpc } = provider();

		await expect(
			port.approveRatingSchemeEntryDeletion(
				reviewer('admin', ['evaluations']),
				'request-1',
				'entry-1',
				'2030-02-01T00:00:00.000Z'
			)
		).rejects.toMatchObject({
			status: 403,
			message:
				'This organization has turned off Evaluations. Speak with the organization owner to have it turned back on.'
		});
		expect(rpc).not.toHaveBeenCalled();
	});

	it('lets an Organization reviewer without a Rating lane delete the bound entry and approve in one command', async () => {
		const { port, rpc } = provider();

		await port.approveRatingSchemeEntryDeletion(reviewer(), 'request-1', 'entry-1', '2030-02-01T00:00:00.000Z');

		expect(rpc.mock.calls).toEqual([
			[
				'approve_record_deletion_request',
				{
					p_organization_id: 'org-1',
					p_request_id: 'request-1',
					p_resource_type: 'rating_scheme_entry',
					p_resource_id: 'entry-1',
					p_reviewer_id: 'reviewer-1',
					p_reviewed_at: '2030-02-01T00:00:00.000Z'
				}
			]
		]);
	});

	it('reports a foreign or missing entry as not found and propagates other failures', async () => {
		await expect(
			provider({ code: 'P0002', message: 'Deletion target not found' }).port.approveRatingSchemeEntryDeletion(
				reviewer(),
				'request-1',
				'foreign-entry',
				'2030-02-01T00:00:00.000Z'
			)
		).rejects.toMatchObject({ status: 404, message: 'Deletion target not found' });
		await expect(
			provider({ message: 'delete unavailable' }).port.approveRatingSchemeEntryDeletion(
				reviewer(),
				'request-1',
				'entry-1',
				'2030-02-01T00:00:00.000Z'
			)
		).rejects.toThrow('delete unavailable');
	});

	it('denies an ordinary member before service access despite Rating configure', async () => {
		const { port, getAdminClient } = provider();
		await expect(
			port.approveRatingSchemeEntryDeletion(reviewer('member'), 'request-1', 'entry-1', '2030-02-01T00:00:00.000Z')
		).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient.mock.calls).toEqual([]);
	});
});
