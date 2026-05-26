import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';

const { loadWithContextMock } = vi.hoisted(() => ({
	loadWithContextMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);

	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

import { load } from './+layout.server';
import { loadWithContextCore } from '$lib/server/adapters/httpAdapter';

describe('settings layout server load', () => {
	it('authorizes organization governance access through the policy evaluator', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			loadWithContextCore(ctx, config)
		);

		const result = await load({
			params: { orgId: 'org-1' },
			locals: {},
			cookies: {}
		} as never);

		expect(loadWithContextMock).toHaveBeenCalledWith(
			{},
			{},
			'org-1',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
				policyResource: { kind: 'organization' }
			})
		);
		expect(result).toEqual({ canAccessOrganizationGovernance: true });
	});

	it('lets policy denials block non-governance members before layout data is returned', async () => {
		const ctx = createTestContext({
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
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			loadWithContextCore(ctx, config)
		);

		await expect(
			load({
				params: { orgId: 'org-1' },
				locals: {},
				cookies: {}
			} as never)
		).rejects.toMatchObject({
			status: 403,
			body: { message: 'You do not have permission to perform this action' }
		});
	});
});
