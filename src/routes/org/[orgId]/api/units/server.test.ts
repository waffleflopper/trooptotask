import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

describe('/api/units route config', () => {
	it('uses policy-first configs for unit management', () => {
		for (const config of [_postConfig, _putConfig, _deleteConfig]) {
			expect('permission' in config).toBe(false);
			expect('deferPolicyToUseCase' in config).toBe(false);
			expect(config.policyAction).toBe(POLICY_ACTION_CATALOG.personnel.manageUnits);
			expect(config.policyResource).toEqual({ kind: 'organization' });
			expect(config.mutation).toBe(true);
		}
	});
});
