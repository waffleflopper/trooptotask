import { describe, expect, it, vi } from 'vitest';
import { _runArchiveRetentionCleanupEndpointCore } from './+server';

function makeRequest(token?: string): Request {
	return new Request('http://localhost/api/cleanup-archived-records', {
		headers: token ? { authorization: `Bearer ${token}` } : {}
	});
}

describe('cleanup archived records endpoint core', () => {
	it('rejects missing bearer token', async () => {
		const runCleanup = vi.fn(async () => ({ deletedCount: 0, orgsAffected: 0, families: [] }));

		await expect(
			_runArchiveRetentionCleanupEndpointCore({
				request: makeRequest(),
				cleanupSecret: 'cleanup-secret',
				cronSecret: 'cron-secret',
				orgConfigs: [],
				runCleanup
			})
		).rejects.toMatchObject({ status: 401 });
		expect(runCleanup).not.toHaveBeenCalled();
	});

	it('accepts CLEANUP_SECRET bearer token and passes Organization configs to the cleanup use case', async () => {
		const response = await _runArchiveRetentionCleanupEndpointCore({
			request: makeRequest('cleanup-secret'),
			cleanupSecret: 'cleanup-secret',
			cronSecret: 'cron-secret',
			orgConfigs: [
				{ id: 'org-1', retentionMonths: 12 },
				{ id: 'org-2', retentionMonths: null }
			],
			runCleanup: async (orgConfigs) => ({
				deletedCount: orgConfigs.length,
				orgsAffected: orgConfigs.length,
				families: []
			})
		});

		await expect(response.json()).resolves.toEqual({ deletedCount: 2, orgsAffected: 2, families: [] });
	});

	it('accepts CRON_SECRET bearer token', async () => {
		const response = await _runArchiveRetentionCleanupEndpointCore({
			request: makeRequest('cron-secret'),
			cleanupSecret: 'cleanup-secret',
			cronSecret: 'cron-secret',
			orgConfigs: [],
			runCleanup: async () => ({ deletedCount: 0, orgsAffected: 0, families: [] })
		});

		expect(response.status).toBe(200);
	});
});
