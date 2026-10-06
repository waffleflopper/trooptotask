import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _createPostConfig } from './+server';
import { createDeletionRequestTestStore } from '$features/deletion-requests/testing.server';
const configFor = (ctx: ReturnType<typeof createTestContext>) =>
	_createPostConfig(createDeletionRequestTestStore(ctx.store));

describe('POST /api/personnel/archive-batch', () => {
	it('declares policy-first authorization for batch archive', () => {
		expect(configFor(createTestContext())).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect('permission' in configFor(createTestContext())).toBe(false);
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

		const result = await handleUseCaseRequest(
			configFor(ctx),
			ctx,
			{
				ids: [firstId, secondId],
				userEmail: 'requester@example.com'
			},
			() => ctx
		);

		expect(result).toEqual({
			archivedIds: [firstId, secondId],
			approvalRequestedIds: [],
			errors: []
		});
		const stored = (await ctx.store.findMany('personnel', ctx.auth.orgId)) as Record<string, unknown>[];
		expect(stored.every((person) => person.archived_at)).toBe(true);
	});

	it('lets personnel managers submit batch archival approval requests', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
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

		const result = await handleUseCaseRequest(
			configFor(ctx),
			ctx,
			{
				ids: [firstId, secondId],
				userEmail: 'requester@example.com'
			},
			() => ctx
		);

		expect(result).toEqual({
			archivedIds: [],
			approvalRequestedIds: [firstId, secondId],
			errors: []
		});
		const requests = (await ctx.store.findMany('deletion_requests', ctx.auth.orgId)) as Record<string, unknown>[];
		expect(requests).toHaveLength(2);
	});
});
