import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _postConfig } from './+server';

describe('POST /api/personnel/batch', () => {
	it('declares policy-first authorization for Personnel import', () => {
		expect(_postConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect('permission' in _postConfig).toBe(false);
	});
});
