import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _deleteConfig, _postConfig } from './+server';

describe('/api/availability/batch route config', () => {
	it('uses policy-first configs for availability mutations', () => {
		for (const config of [_postConfig, _deleteConfig]) {
			expect('permission' in config).toBe(false);
			expect('deferPolicyToUseCase' in config).toBe(false);
			expect(config.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.manageAvailability);
			expect(config.policyResource).toEqual({ kind: 'unscoped' });
			expect(config.mutation).toBe(true);
		}
	});
});
