import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _deleteConfig } from './+server';

describe('/api/sign-in-rosters/[id] route config', () => {
	it('uses the Training sign-in roster policy for deletion', () => {
		expect('permission' in _deleteConfig).toBe(false);
		expect('deferPolicyToUseCase' in _deleteConfig).toBe(false);
		expect(_deleteConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.manageSignInRosters);
		expect(_deleteConfig.policyResource).toEqual({ kind: 'unscoped' });
		expect(_deleteConfig.mutation).toBe(true);
	});
});
