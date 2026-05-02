import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const validInput = {
	ratedPersonId: 'person-1',
	evalType: 'OER',
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-06-30',
	status: 'draft'
};

describe('POST /api/rating-scheme', () => {
	it('authorizes through Rating Scheme policy decisions instead of legacy route permissions', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				isFullEditor: false,
				requireEdit() {
					throw new Error('legacy requireEdit should not authorize Rating Scheme writes');
				},
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'operate'
				}
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null
			}
		]);

		const result = (await handleUseCaseRequest(_postConfig, ctx, validInput)) as Record<string, unknown>;

		expect(result).toMatchObject({
			ratedPersonId: 'person-1',
			evalType: 'OER'
		});
	});
});
