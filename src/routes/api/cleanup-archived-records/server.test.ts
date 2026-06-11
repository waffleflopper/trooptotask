import { describe, expect, it, vi } from 'vitest';
import { _runArchiveRetentionCleanupEndpointCore } from './+server';

function makeRequest(token?: string): Request {
	return new Request('http://localhost/api/cleanup-archived-records', {
		headers: token ? { authorization: `Bearer ${token}` } : {}
	});
}

function makeRequestWithAuthorization(authorization: string): Request {
	return new Request('http://localhost/api/cleanup-archived-records', {
		headers: { authorization }
	});
}

describe('cleanup archived records endpoint core', () => {
	it('rejects missing bearer token', async () => {
		const runCleanup = vi.fn(async () => ({ deletedCount: 0, orgsAffected: 0, families: [] }));

		await expect(
			_runArchiveRetentionCleanupEndpointCore({
				request: makeRequest(),
				env: {
					CLEANUP_SECRET: 'cleanup-secret',
					CRON_SECRET: 'cron-secret'
				},
				orgConfigs: [],
				runCleanup
			})
		).rejects.toMatchObject({ status: 401 });
		expect(runCleanup).not.toHaveBeenCalled();
	});

	it.each([
		{
			name: 'CLEANUP_SECRET is empty and the bearer header is blank',
			request: makeRequestWithAuthorization('Bearer '),
			env: { CLEANUP_SECRET: '', CRON_SECRET: undefined }
		},
		{
			name: 'CRON_SECRET is whitespace and the bearer header has no token',
			request: makeRequestWithAuthorization('Bearer'),
			env: { CLEANUP_SECRET: undefined, CRON_SECRET: '   ' }
		},
		{
			name: 'both secrets are unset and a bearer token is present',
			request: makeRequest('any-value'),
			env: { CLEANUP_SECRET: undefined, CRON_SECRET: undefined }
		}
	])('fails closed when $name', async ({ request, env }) => {
		const runCleanup = vi.fn(async () => ({ deletedCount: 0, orgsAffected: 0, families: [] }));

		await expect(
			_runArchiveRetentionCleanupEndpointCore({
				request,
				env,
				orgConfigs: [],
				runCleanup
			})
		).rejects.toMatchObject({
			status: 500,
			body: { message: 'Cleanup secret is not configured' }
		});
		expect(runCleanup).not.toHaveBeenCalled();
	});

	it('accepts CLEANUP_SECRET bearer token and passes Organization configs to the cleanup use case', async () => {
		const orgConfigs = [
			{ id: 'org-1', retentionMonths: 12 },
			{ id: 'org-2', retentionMonths: null }
		];
		const runCleanup = vi.fn(async (configs) => ({
			deletedCount: configs.length,
			orgsAffected: configs.length,
			families: []
		}));

		const response = await _runArchiveRetentionCleanupEndpointCore({
			request: makeRequest('cleanup-secret'),
			env: {
				CLEANUP_SECRET: 'cleanup-secret',
				CRON_SECRET: 'cron-secret'
			},
			orgConfigs,
			runCleanup
		});

		await expect(response.json()).resolves.toEqual({ deletedCount: 2, orgsAffected: 2, families: [] });
		expect(runCleanup).toHaveBeenCalledWith(orgConfigs);
	});

	it('accepts CRON_SECRET bearer token', async () => {
		const response = await _runArchiveRetentionCleanupEndpointCore({
			request: makeRequest('cron-secret'),
			env: {
				CLEANUP_SECRET: 'cleanup-secret',
				CRON_SECRET: 'cron-secret'
			},
			orgConfigs: [],
			runCleanup: async () => ({ deletedCount: 0, orgsAffected: 0, families: [] })
		});

		expect(response.status).toBe(200);
	});
});
