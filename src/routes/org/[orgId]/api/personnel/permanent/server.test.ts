import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig } from './+server';

describe('DELETE /api/personnel/permanent', () => {
	it('declares policy-first authorization for permanent Personnel deletion', () => {
		expect(_deleteConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.permanentlyDeleteRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect('permission' in _deleteConfig).toBe(false);
		expect('deferPolicyToUseCase' in _deleteConfig).toBe(false);
	});

	it('uses Personnel policy decisions instead of route-level privileged authorization', async () => {
		const requirePrivileged = vi.fn(() => {
			throw new Error('legacy requirePrivileged should not authorize permanent Personnel deletion');
		});
		const ctx = createTestContext({
			auth: {
				requirePrivileged,
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
		ctx.store.seed('personnel', [
			{
				id: '11111111-1111-4111-8111-111111111111',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_deleteConfig, ctx, { id: '11111111-1111-4111-8111-111111111111' });

		expect(result).toEqual({ success: true });
		expect(requirePrivileged).not.toHaveBeenCalled();
	});
});
