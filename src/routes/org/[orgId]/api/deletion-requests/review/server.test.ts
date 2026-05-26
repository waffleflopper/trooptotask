import { describe, expect, it } from 'vitest';
import { _postConfig } from './+server';

describe('/api/deletion-requests/review route config', () => {
	it('uses policy-first organization deletion-request review authorization', () => {
		expect(_postConfig.policyAction?.id).toBe('organization.reviewDeletionRequests');
		expect(_postConfig.mutation).toBe(true);
		expect('permission' in _postConfig).toBe(false);
	});
});
