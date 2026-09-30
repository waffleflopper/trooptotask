import { describe, expect, it, vi } from 'vitest';
import {
	deleteAllOwnNotifications,
	deleteOwnNotification,
	getUnreadNotificationCount,
	listNotificationExportRows,
	listOwnNotifications,
	markAllOwnNotificationsRead,
	markOwnNotificationRead,
	type NotificationSelfPorts
} from './notificationOperations.server';
import { createSupabaseNotificationStore } from './notificationProvider.server';
import { notificationTestProvider, savedNotification } from './notificationTestProvider';

function selfPorts(provider: ReturnType<typeof notificationTestProvider>): NotificationSelfPorts {
	return {
		auth: {
			orgId: 'org-a',
			userId: 'own-user',
			role: 'member',
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet: { kind: 'groups', groupIds: [] }
		},
		audit: { log: vi.fn() },
		store: createSupabaseNotificationStore(provider.client)
	};
}

describe('notification self operations', () => {
	it('retains own lifecycle without feature grants and covers rows outside the visible inbox', async () => {
		const own = Array.from({ length: 24 }, (_, index) => savedNotification(`own-${index}`));
		const provider = notificationTestProvider([
			...own,
			savedNotification('peer', { user_id: 'peer-user' }),
			savedNotification('own-b', { organization_id: 'org-b' })
		]);
		const ports = selfPorts(provider);
		expect(await listOwnNotifications(ports)).toHaveLength(20);
		expect(await getUnreadNotificationCount(ports)).toBe(24);
		expect(await listNotificationExportRows(ports)).toEqual(own);
		await markOwnNotificationRead(ports, 'own-0');
		expect(await getUnreadNotificationCount(ports)).toBe(23);
		await markAllOwnNotificationsRead(ports);
		expect(
			provider.state.rows
				.filter(({ user_id, organization_id }) => user_id === 'own-user' && organization_id === 'org-a')
				.every(({ read }) => read)
		).toBe(true);
		expect(provider.state.rows.find(({ id }) => id === 'peer')?.read).toBe(false);
		expect(provider.state.rows.find(({ id }) => id === 'own-b')?.read).toBe(false);
		await deleteOwnNotification(ports, 'own-0');
		await deleteAllOwnNotifications(ports);
		expect(provider.state.rows.map(({ id }) => id)).toEqual(['peer', 'own-b']);
	});

	it('denies a visible peer before mutation with the retained policy audit and 403', async () => {
		const provider = notificationTestProvider([savedNotification('peer', { user_id: 'peer-user' })]);
		const ports = selfPorts(provider);
		await expect(markOwnNotificationRead(ports, 'peer')).rejects.toMatchObject({ status: 403 });
		await expect(deleteOwnNotification(ports, 'peer')).rejects.toMatchObject({ status: 403 });
		expect(provider.state.rows).toEqual([savedNotification('peer', { user_id: 'peer-user' })]);
		expect(ports.audit.log).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'notification',
				resourceId: 'peer',
				details: { policyAction: 'identity.updateOwnNotifications', reasonCode: 'denied:not-resource-owner' }
			})
		);
	});

	it('preserves concealed/missing resource 404 and unauthenticated self-policy 401', async () => {
		const provider = notificationTestProvider([savedNotification('peer', { user_id: 'peer-user' })], 'own-user');
		const ports = selfPorts(provider);
		await expect(markOwnNotificationRead(ports, 'peer')).rejects.toMatchObject({
			status: 404,
			message: 'Notification not found'
		});
		await expect(deleteOwnNotification(ports, 'missing')).rejects.toMatchObject({ status: 404 });
		ports.auth = { ...ports.auth, userId: '' };
		await expect(listOwnNotifications(ports)).rejects.toMatchObject({ status: 401 });
		expect(provider.state.rows).toHaveLength(1);
	});

	it('propagates a failed bulk save without a success audit and permits an explicit retry', async () => {
		const provider = notificationTestProvider([savedNotification('own')]);
		const ports = selfPorts(provider);
		provider.state.failure = { method: 'PATCH', message: 'save unavailable' };
		await expect(markAllOwnNotificationsRead(ports)).rejects.toThrow('save unavailable');
		expect(provider.state.rows[0].read).toBe(false);
		expect(ports.audit.log).not.toHaveBeenCalled();
		provider.state.failure = null;
		await markAllOwnNotificationsRead(ports);
		expect(provider.state.rows[0].read).toBe(true);
		expect(ports.audit.log).toHaveBeenCalledWith({
			action: 'notification.mark_all_read',
			resourceType: 'notification'
		});
	});
});
