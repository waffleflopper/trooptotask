import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _runCleanupOldDataEndpointCore } from './+server';

function makeRequest(token?: string): Request {
	return new Request('http://localhost/api/cleanup-old-data', {
		headers: token ? { authorization: `Bearer ${token}` } : {}
	});
}

function makeRpcResult(data: number | null, error: unknown = null) {
	return { data, error };
}

describe('cleanup old data endpoint core', () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	it('rejects missing bearer token', async () => {
		const runAuditCleanup = vi.fn(async () => makeRpcResult(0));
		const runWebhookCleanup = vi.fn(async () => makeRpcResult(0));

		await expect(
			_runCleanupOldDataEndpointCore({
				request: makeRequest(),
				env: {
					CLEANUP_SECRET: 'cleanup-secret',
					CRON_SECRET: 'cron-secret'
				},
				runAuditCleanup,
				runWebhookCleanup
			})
		).rejects.toMatchObject({ status: 401 });
		expect(runAuditCleanup).not.toHaveBeenCalled();
		expect(runWebhookCleanup).not.toHaveBeenCalled();
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('accepts CLEANUP_SECRET bearer token and returns cleanup counts', async () => {
		const response = await _runCleanupOldDataEndpointCore({
			request: makeRequest('cleanup-secret'),
			env: {
				CLEANUP_SECRET: 'cleanup-secret',
				CRON_SECRET: 'cron-secret'
			},
			runAuditCleanup: async () => makeRpcResult(3),
			runWebhookCleanup: async () => makeRpcResult(5)
		});

		await expect(response.json()).resolves.toEqual({
			auditLogsDeleted: 3,
			webhookEventsDeleted: 5
		});
	});

	it('accepts CRON_SECRET bearer token', async () => {
		const response = await _runCleanupOldDataEndpointCore({
			request: makeRequest('cron-secret'),
			env: {
				CLEANUP_SECRET: 'cleanup-secret',
				CRON_SECRET: 'cron-secret'
			},
			runAuditCleanup: async () => makeRpcResult(0),
			runWebhookCleanup: async () => makeRpcResult(0)
		});

		expect(response.status).toBe(200);
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('rejects audit RPC errors with a safe 500', async () => {
		await expect(
			_runCleanupOldDataEndpointCore({
				request: makeRequest('cleanup-secret'),
				env: {
					CLEANUP_SECRET: 'cleanup-secret',
					CRON_SECRET: 'cron-secret'
				},
				runAuditCleanup: async () => makeRpcResult(null, { message: 'database details' }),
				runWebhookCleanup: async () => makeRpcResult(5)
			})
		).rejects.toMatchObject({
			status: 500,
			body: { message: 'Failed to cleanup old data' }
		});
		expect(consoleErrorSpy).toHaveBeenCalledWith('Cleanup old data RPC failure', {
			auditError: { message: 'database details' },
			webhookError: null
		});
	});

	it('rejects webhook RPC errors with a safe 500', async () => {
		await expect(
			_runCleanupOldDataEndpointCore({
				request: makeRequest('cleanup-secret'),
				env: {
					CLEANUP_SECRET: 'cleanup-secret',
					CRON_SECRET: 'cron-secret'
				},
				runAuditCleanup: async () => makeRpcResult(3),
				runWebhookCleanup: async () => makeRpcResult(null, { message: 'database details' })
			})
		).rejects.toMatchObject({
			status: 500,
			body: { message: 'Failed to cleanup old data' }
		});
		expect(consoleErrorSpy).toHaveBeenCalledWith('Cleanup old data RPC failure', {
			auditError: null,
			webhookError: { message: 'database details' }
		});
	});

	it('does not report fake zero-count success when one RPC errors', async () => {
		const runAuditCleanup = vi.fn(async () => makeRpcResult(null, { message: 'audit failed' }));
		const runWebhookCleanup = vi.fn(async () => makeRpcResult(0));

		await expect(
			_runCleanupOldDataEndpointCore({
				request: makeRequest('cleanup-secret'),
				env: {
					CLEANUP_SECRET: 'cleanup-secret',
					CRON_SECRET: 'cron-secret'
				},
				runAuditCleanup,
				runWebhookCleanup
			})
		).rejects.toMatchObject({ status: 500 });
		expect(runAuditCleanup).toHaveBeenCalledOnce();
		expect(runWebhookCleanup).toHaveBeenCalledOnce();
		expect(consoleErrorSpy).toHaveBeenCalledWith('Cleanup old data RPC failure', {
			auditError: { message: 'audit failed' },
			webhookError: null
		});
	});
});
