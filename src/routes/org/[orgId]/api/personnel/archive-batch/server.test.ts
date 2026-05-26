import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('POST /api/personnel/archive-batch', () => {
	it('declares policy-first authorization for batch archive', () => {
		expect(_postConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.archiveRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect('permission' in _postConfig).toBe(false);
		expect('deferPolicyToUseCase' in _postConfig).toBe(false);
	});

	it('archives selected personnel through one route use case request', async () => {
		const ctx = createTestContext();
		const firstId = '11111111-1111-4111-8111-111111111111';
		const secondId = '22222222-2222-4222-8222-222222222222';
		ctx.store.seed('personnel', [
			{
				id: firstId,
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				group_id: null,
				archived_at: null
			},
			{
				id: secondId,
				organization_id: ctx.auth.orgId,
				rank: 'SSG',
				last_name: 'Jones',
				first_name: 'Pat',
				group_id: null,
				archived_at: null
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			ids: [firstId, secondId],
			userEmail: 'requester@example.com'
		});

		expect(result).toEqual({
			archivedIds: [firstId, secondId],
			approvalRequestedIds: [],
			errors: []
		});
		const stored = (await ctx.store.findMany('personnel', ctx.auth.orgId)) as Record<string, unknown>[];
		expect(stored.every((person) => person.archived_at)).toBe(true);
	});
});
