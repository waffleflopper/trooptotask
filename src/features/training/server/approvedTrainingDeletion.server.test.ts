import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { createSupabaseApprovedTrainingDeletionPort } from './approvedTrainingDeletion.server';

function provider(error: { code?: string; message: string } | null = null) {
	const rpc = vi.fn(async () => ({ data: null, error }));
	const getAdminClient = vi.fn(() => ({ rpc }) as unknown as SupabaseClient);
	return { rpc, getAdminClient, port: createSupabaseApprovedTrainingDeletionPort(getAdminClient) };
}

function reviewer(role: 'admin' | 'member' = 'admin', disabledFeatures: FeatureKey[] = []) {
	const auth = createTestAuthContext({
		orgId: 'org-1',
		userId: 'reviewer-1',
		role,
		isPrivileged: role === 'admin',
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: role === 'admin' ? 'none' : 'configure',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		}
	});
	return { auth, disabledFeatures };
}

describe('approved Training deletion provider', () => {
	it.each([
		['type', 'training_type'],
		['record', 'personnel_training']
	] as const)(
		'deletes the bound Training %s and approves its request in one database command',
		async (kind, resourceType) => {
			const { port, rpc } = provider();
			const approve = kind === 'type' ? port.approveTrainingTypeDeletion : port.approveTrainingRecordDeletion;

			await approve(reviewer(), 'request-1', 'target-1', '2030-02-01T00:00:00.000Z');

			expect(rpc.mock.calls).toEqual([
				[
					'approve_record_deletion_request',
					{
						p_organization_id: 'org-1',
						p_request_id: 'request-1',
						p_resource_type: resourceType,
						p_resource_id: 'target-1',
						p_reviewer_id: 'reviewer-1',
						p_reviewed_at: '2030-02-01T00:00:00.000Z'
					}
				]
			]);
		}
	);

	it('keeps the request pending while Training is off', async () => {
		const { port, rpc } = provider();

		await expect(
			port.approveTrainingTypeDeletion(
				reviewer('admin', ['training']),
				'request-1',
				'type-1',
				'2030-02-01T00:00:00.000Z'
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'This organization has turned off Training. Speak with the organization owner to have it turned back on.'
		});
		expect(rpc).not.toHaveBeenCalled();
	});

	it('reports a foreign, missing or no longer pending target as not found', async () => {
		const missing = provider({ code: 'P0002', message: 'Deletion target not found' });
		await expect(
			missing.port.approveTrainingRecordDeletion(reviewer(), 'request-1', 'foreign-1', '2030-02-01T00:00:00.000Z')
		).rejects.toMatchObject({ status: 404, message: 'Deletion target not found' });

		const settled = provider({ code: 'P0002', message: 'Pending deletion request not found' });
		await expect(
			settled.port.approveTrainingTypeDeletion(reviewer(), 'request-1', 'type-1', '2030-02-01T00:00:00.000Z')
		).rejects.toMatchObject({ status: 404, message: 'Pending deletion request not found' });
	});

	it('propagates other database failures', async () => {
		const { port } = provider({ code: '23503', message: 'foreign reference blocks delete' });
		await expect(
			port.approveTrainingTypeDeletion(reviewer(), 'request-1', 'type-1', '2030-02-01T00:00:00.000Z')
		).rejects.toThrow('foreign reference blocks delete');
	});

	it('denies a member before opening the admin client even with Training configure', async () => {
		const { port, getAdminClient } = provider();
		await expect(
			port.approveTrainingTypeDeletion(reviewer('member'), 'request-1', 'type-1', '2030-02-01T00:00:00.000Z')
		).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient.mock.calls).toEqual([]);
	});
});
