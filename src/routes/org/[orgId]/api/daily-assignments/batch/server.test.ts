import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _postConfig } from './+server';

describe('/api/daily-assignments/batch route config', () => {
	it('uses a policy-first config for batch assignment mutations', () => {
		expect('permission' in _postConfig).toBe(false);
		expect('deferPolicyToUseCase' in _postConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.manageAssignments);
		expect(_postConfig.policyResource).toEqual({ kind: 'unscoped' });
		expect(_postConfig.mutation).toBe(true);
	});
});
