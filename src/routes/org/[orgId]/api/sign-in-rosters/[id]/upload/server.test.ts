import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _deleteConfig, _getConfig, _postConfig } from './+server';

describe('/api/sign-in-rosters/[id]/upload route config', () => {
	it('uses policy-first configs for uploaded sign-in roster scans', () => {
		expect('permission' in _getConfig).toBe(false);
		expect('permission' in _postConfig).toBe(false);
		expect('permission' in _deleteConfig).toBe(false);
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.viewRecords);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.manageSignInRosters);
		expect(_deleteConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.manageSignInRosters);
	});
});
