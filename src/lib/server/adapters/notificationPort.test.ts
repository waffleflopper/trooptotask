import { describe, it, expect } from 'vitest';
import { createTestNotificationPort, createTestContext } from './inMemory';

describe('NotificationPort (in-memory)', () => {
	it('records notifyUser calls', async () => {
		const port = createTestNotificationPort();

		await port.notifyUser('org-1', 'user-1', {
			type: 'test',
			title: 'Test Title',
			message: 'Test message'
		});

		expect(port.notifications).toHaveLength(1);
		expect(port.notifications[0]).toEqual({
			target: 'user',
			orgId: 'org-1',
			userId: 'user-1',
			notification: { type: 'test', title: 'Test Title', message: 'Test message' }
		});
	});

	it('records notifyAdmins calls', async () => {
		const port = createTestNotificationPort();

		await port.notifyAdmins('org-1', 'exclude-user', {
			type: 'alert',
			title: 'Admin Alert',
			message: 'Something happened',
			link: '/admin'
		});

		expect(port.notifications).toHaveLength(1);
		expect(port.notifications[0]).toEqual({
			target: 'admins',
			orgId: 'org-1',
			excludeUserId: 'exclude-user',
			notification: { type: 'alert', title: 'Admin Alert', message: 'Something happened', link: '/admin' }
		});
	});

	it('createTestContext includes notifications field', () => {
		const ctx = createTestContext();

		expect(ctx.notifications).toBeDefined();
		expect(ctx.notificationPort).toBeDefined();
		expect(ctx.notifications).toBe(ctx.notificationPort);
	});
});
