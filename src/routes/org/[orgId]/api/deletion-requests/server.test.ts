import { describe, expect, it } from 'vitest';
import { _deleteConfig, _getConfig, _postConfig } from './+server';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';

describe('/api/deletion-requests route config', () => {
	it('uses policy-first identity-owned self-service actions', () => {
		expect(_getConfig.policyAction?.id).toBe('identity.listOwnDeletionRequests');
		expect(_postConfig.policyAction?.id).toBe('identity.createOwnDeletionRequest');
		expect(_deleteConfig.policyAction?.id).toBe('identity.cancelOwnDeletionRequest');
		expect(_postConfig.mutation).toBe(true);
		expect(_deleteConfig.mutation).toBe(true);
		expect('permission' in _getConfig).toBe(false);
		expect('permission' in _postConfig).toBe(false);
		expect('permission' in _deleteConfig).toBe(false);
	});

	it('rejects null DELETE payloads with a 400 instead of throwing a type error', async () => {
		await expect(handleUseCaseRequest(_deleteConfig, createTestContext(), null)).rejects.toMatchObject({
			status: 400
		});
	});
});
