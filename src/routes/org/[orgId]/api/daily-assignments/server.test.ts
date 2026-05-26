import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _deleteConfig, _postConfig } from './+server';

describe('/api/daily-assignments route config', () => {
	it('uses policy-first configs for assignment mutations', () => {
		for (const config of [_postConfig, _deleteConfig]) {
			expect('permission' in config).toBe(false);
			expect('deferPolicyToUseCase' in config).toBe(false);
			expect(config.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.manageAssignments);
			expect(config.policyResource).toEqual({ kind: 'unscoped' });
			expect(config.mutation).toBe(true);
		}
	});
});
