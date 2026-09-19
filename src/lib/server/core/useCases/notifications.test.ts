import { describe, expect, it } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import {
	deleteAllOwnNotifications,
	deleteOwnNotification,
	listOwnNotifications,
	markAllOwnNotificationsRead,
	markOwnNotificationRead
} from './notifications';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

function seedNotifications(ctx: ReturnType<typeof buildContext>) {
	ctx.store.seed('notifications', [
		{
			id: 'note-owned-unread',
			organization_id: 'test-org',
			user_id: 'member-user',
			title: 'Owned unread',
			read: false,
			created_at: '2026-05-02T01:00:00.000Z'
		},
		{
			id: 'note-owned-read',
			organization_id: 'test-org',
			user_id: 'member-user',
			title: 'Owned read',
			read: true,
			created_at: '2026-05-02T00:00:00.000Z'
		},
		{
			id: 'note-other',
			organization_id: 'test-org',
			user_id: 'other-user',
			title: 'Other user',
			read: false,
			created_at: '2026-05-02T02:00:00.000Z'
		}
	]);
}

const memberAuth = {
	userId: 'member-user',
	role: 'member' as const,
	isPrivileged: false,
	capabilityMap: {
		calendar: 'view' as const,
		personnel: 'view' as const,
		training: 'view' as const,
		criticalTasks: 'view' as const,
		onboarding: 'view' as const,
		ratingScheme: 'view' as const
	}
};

describe('notification identity workflows', () => {
	it('lists only the authenticated viewer/operator/editor/owner notifications without feature edit permission', async () => {
		for (const auth of [
			memberAuth,
			{ ...memberAuth, capabilityMap: { ...memberAuth.capabilityMap, personnel: 'operate' as const } },
			{ ...memberAuth, capabilityMap: { ...memberAuth.capabilityMap, personnel: 'configure' as const } },
			{ ...memberAuth, role: 'owner' as const, isPrivileged: true }
		]) {
			const ctx = buildContext({ auth });
			seedNotifications(ctx);

			const result = await listOwnNotifications(ctx);

			expect(result.map((notification) => notification.id)).toEqual(['note-owned-unread', 'note-owned-read']);
		}
	});

	it('marks all own notifications read and leaves cross-user notifications untouched', async () => {
		const ctx = buildContext({ auth: memberAuth });
		seedNotifications(ctx);

		await markAllOwnNotificationsRead(ctx);

		const owned = await ctx.store.findOne<Record<string, unknown>>('notifications', 'test-org', {
			id: 'note-owned-unread'
		});
		const other = await ctx.store.findOne<Record<string, unknown>>('notifications', 'test-org', { id: 'note-other' });
		expect(owned).toMatchObject({ read: true });
		expect(other).toMatchObject({ read: false });
		expect(ctx.audit.events).toEqual([
			expect.objectContaining({ action: 'notification.mark_all_read', resourceType: 'notification' })
		]);
	});

	it('rejects single notification read updates for another user before mutation', async () => {
		const ctx = buildContext({ auth: memberAuth });
		seedNotifications(ctx);

		await expect(markOwnNotificationRead(ctx, 'note-other')).rejects.toMatchObject({ status: 403 });

		const other = await ctx.store.findOne<Record<string, unknown>>('notifications', 'test-org', { id: 'note-other' });
		expect(other).toMatchObject({ read: false });
		expect(ctx.audit.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'notification',
				resourceId: 'note-other',
				details: expect.objectContaining({
					policyAction: 'identity.updateOwnNotifications',
					reasonCode: 'denied:not-resource-owner'
				})
			})
		]);
	});

	it('rejects single notification deletion for another user before mutation', async () => {
		const ctx = buildContext({ auth: memberAuth });
		seedNotifications(ctx);

		await expect(deleteOwnNotification(ctx, 'note-other')).rejects.toMatchObject({ status: 403 });

		const all = await ctx.store.findMany<Record<string, unknown>>('notifications', 'test-org');
		expect(all.map((notification) => notification.id)).toContain('note-other');
	});

	it('deletes all own notifications and leaves cross-user notifications untouched', async () => {
		const ctx = buildContext({ auth: memberAuth });
		seedNotifications(ctx);

		await deleteAllOwnNotifications(ctx);

		const remaining = await ctx.store.findMany<Record<string, unknown>>('notifications', 'test-org');
		expect(remaining.map((notification) => notification.id)).toEqual(['note-other']);
	});
});
