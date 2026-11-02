import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { GET } from './+server';

const { auditCleanup, notificationCleanup, errorCleanup, env } = vi.hoisted(() => ({
	auditCleanup: vi.fn(),
	notificationCleanup: vi.fn(),
	errorCleanup: vi.fn(),
	env: { CLEANUP_SECRET: 'synthetic-cleanup-secret', CRON_SECRET: 'synthetic-cron-secret' }
}));
vi.mock('$lib/server/adapters/scheduledMaintenanceSources.server', () => ({
	cleanupRetainedAuditLogs: auditCleanup,
	cleanupRetainedReadNotifications: notificationCleanup,
	cleanupRetainedPlatformErrors: errorCleanup
}));
vi.mock('$env/dynamic/private', () => ({ env }));

function request(authorization?: string) {
	return {
		request: new Request('https://example.test/api/cleanup-old-data', {
			headers: authorization ? { authorization } : {}
		})
	} as RequestEvent;
}

beforeEach(() => {
	auditCleanup.mockReset();
	notificationCleanup.mockReset();
	errorCleanup.mockReset();
	errorCleanup.mockResolvedValue(5);
	auditCleanup.mockResolvedValue(3);
	notificationCleanup.mockResolvedValue(2);
});

describe('scheduled old-data cleanup', () => {
	it.each(['synthetic-cleanup-secret', 'synthetic-cron-secret'])(
		'permits configured credential %s and reports every retention count',
		async (secret) => {
			const response = await GET(request(`Bearer ${secret}`));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				auditLogsDeleted: 3,
				notificationsDeleted: 2,
				errorOccurrencesDeleted: 5
			});
		}
	);

	it.each([undefined, 'Bearer incorrect-secret'])(
		'rejects unauthorized cleanup before acquiring privileged sources',
		async (header) => {
			await expect(GET(request(header))).rejects.toMatchObject({ status: 401 });
			expect(auditCleanup).not.toHaveBeenCalled();
			expect(notificationCleanup).not.toHaveBeenCalled();
			expect(errorCleanup).not.toHaveBeenCalled();
		}
	);

	it.each([
		['audit', auditCleanup],
		['notifications', notificationCleanup],
		['error reports', errorCleanup]
	])('reports %s cleanup failure instead of successful counts', async (_source, cleanup) => {
		cleanup.mockRejectedValue(new Error('Synthetic persistence failure'));
		await expect(GET(request('Bearer synthetic-cron-secret'))).rejects.toMatchObject({ status: 500 });
	});
});
