import { describe, expect, it } from 'vitest';
import { cleanupReadNotifications } from './notificationRetention.server';
import { notificationTestProvider, savedNotification } from './notificationTestProvider.server';

describe('read notification retention', () => {
	it('deletes only read notifications strictly older than thirty days and is safe to repeat', async () => {
		const provider = notificationTestProvider([
			savedNotification('expired', { read: true, created_at: '2026-09-25T11:59:59.999Z' }),
			savedNotification('boundary', { read: true, created_at: '2026-09-25T12:00:00.000Z' }),
			savedNotification('recent', { read: true, created_at: '2026-10-24T12:00:00.000Z' }),
			savedNotification('unread', { created_at: '2020-01-01T00:00:00.000Z' })
		]);
		const now = new Date('2026-10-25T12:00:00.000Z');
		expect(await cleanupReadNotifications(provider.client, now)).toBe(1);
		expect(provider.state.rows.map(({ id }) => id)).toEqual(['boundary', 'recent', 'unread']);
		expect(await cleanupReadNotifications(provider.client, now)).toBe(0);
	});

	it('reports a failed delete and retains all stored notifications', async () => {
		const row = savedNotification('expired', { read: true });
		const provider = notificationTestProvider([row]);
		provider.state.failure = { method: 'DELETE', message: 'unavailable' };
		await expect(cleanupReadNotifications(provider.client, new Date('2026-12-01T00:00:00Z'))).rejects.toThrow(
			'Notification retention failed'
		);
		expect(provider.state.rows).toEqual([row]);
	});
});
