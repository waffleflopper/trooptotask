import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('POST /api/deletion-requests/review', () => {
	it('approves same-Organization counseling deletion for an admin with no Personnel lane', async () => {
		const ctx = createTestContext({
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
		ctx.rawStore.seed('deletion_requests', [
			{
				id: 'request-1',
				organization_id: ctx.auth.orgId,
				resource_type: 'counseling_record',
				resource_id: 'record-1',
				status: 'pending'
			}
		]);
		ctx.rawStore.seed('counseling_records', [
			{ id: 'record-1', organization_id: ctx.auth.orgId, personnel_id: 'person-1' },
			{ id: 'record-1', organization_id: 'other-org', personnel_id: 'person-2' }
		]);

		await expect(handleUseCaseRequest(_postConfig, ctx, { id: 'request-1', action: 'approve' })).resolves.toEqual({
			success: true
		});
		expect(await ctx.rawStore.findOne('counseling_records', ctx.auth.orgId, { id: 'record-1' })).toBeNull();
		expect(await ctx.rawStore.findOne('counseling_records', 'other-org', { id: 'record-1' })).not.toBeNull();
		expect(await ctx.rawStore.findOne('deletion_requests', ctx.auth.orgId, { id: 'request-1' })).toMatchObject({
			status: 'approved'
		});
	});
});
