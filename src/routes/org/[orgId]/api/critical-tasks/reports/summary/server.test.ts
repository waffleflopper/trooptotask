import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _getConfig } from './+server';

describe('GET /api/critical-tasks/reports/summary route config', () => {
	it('uses policy-first Critical Tasks readiness authorization', () => {
		expect('permission' in _getConfig).toBe(false);
		expect('deferPolicyToUseCase' in _getConfig).toBe(false);
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.criticalTasks.viewReadiness);
		expect(_getConfig.policyResource).toEqual({ kind: 'unscoped' });
	});
});
