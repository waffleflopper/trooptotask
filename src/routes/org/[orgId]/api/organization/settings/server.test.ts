import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('/api/organization/settings', () => {
	it('denies settings updates to members with Personnel configure authority', async () => {
		const memberCtx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(handleUseCaseRequest(_postConfig, memberCtx, { lossWarningWindowDays: 90 })).rejects.toMatchObject({
			status: 403
		});
	});
});
