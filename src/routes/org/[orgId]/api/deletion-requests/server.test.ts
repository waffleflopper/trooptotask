import { describe, expect, it } from 'vitest';
import { _createDeleteConfig } from './+server';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';

const _deleteConfig = _createDeleteConfig({
	async cancelPendingRequest() {
		throw new Error('Unexpected cancellation');
	}
});

describe('/api/deletion-requests route config', () => {
	it('rejects missing identity before looking up a request', async () => {
		const ctx = createTestContext({ auth: { userId: '' } });
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: 'unavailable-request' })).rejects.toMatchObject({
			status: 403
		});
	});

	it('rejects null DELETE payloads with a 400 instead of throwing a type error', async () => {
		await expect(handleUseCaseRequest(_deleteConfig, createTestContext(), null)).rejects.toMatchObject({
			status: 400
		});
	});
});
