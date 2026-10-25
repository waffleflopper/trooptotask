import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseNotificationDelivery } from './delivery.server';
import { notificationTestProvider } from './notificationTestProvider.server';

afterEach(() => vi.restoreAllMocks());

const payload = { type: 'member_removed', title: 'Removed', message: 'Membership ended', link: '/org/org-a/settings' };

describe('notification delivery', () => {
	it('acquires privilege only for a send and stores an explicitly selected user without membership lookup', async () => {
		const provider = notificationTestProvider();
		const getAdminClient = vi.fn(() => provider.client);
		const resolveAdministratorRecipients = vi.fn(async () => ({ userIds: [], errorMessage: null }));
		const delivery = createSupabaseNotificationDelivery({ getAdminClient, resolveAdministratorRecipients });
		expect(getAdminClient).not.toHaveBeenCalled();
		await delivery.notifyUser('org-a', 'removed-user', payload);
		expect(resolveAdministratorRecipients).not.toHaveBeenCalled();
		expect(provider.state.rows).toEqual([
			expect.objectContaining({ organization_id: 'org-a', user_id: 'removed-user', ...payload })
		]);
	});

	it('delivers a feedback reply to an account without Organization context', async () => {
		const provider = notificationTestProvider();
		const delivery = createSupabaseNotificationDelivery({
			getAdminClient: () => provider.client,
			resolveAdministratorRecipients: async () => ({ userIds: [], errorMessage: null }),
			failureMode: 'required'
		});
		await delivery.notifyUser(null, 'reporter', {
			type: 'feedback_reply',
			title: 'Reply',
			message: 'An operator replied',
			link: '/feedback/report-1'
		});
		expect(provider.state.rows[0]).toMatchObject({
			user_id: 'reporter',
			organization_id: null,
			type: 'feedback_reply',
			link: '/feedback/report-1'
		});
	});

	it('resolves each admin send, excludes the actor, and skips an empty audience without inserting', async () => {
		const provider = notificationTestProvider();
		let userIds = ['actor', 'owner'];
		const delivery = createSupabaseNotificationDelivery({
			getAdminClient: () => provider.client,
			resolveAdministratorRecipients: async () => ({ userIds, errorMessage: null })
		});
		await delivery.notifyAdmins('org-a', 'actor', { ...payload, link: undefined });
		userIds = ['new-admin'];
		await delivery.notifyAdmins('org-a', null, payload);
		userIds = ['actor'];
		await delivery.notifyAdmins('org-a', 'actor', payload);
		userIds = [];
		await delivery.notifyAdmins('org-a', null, payload);
		expect(provider.state.rows.map(({ user_id }) => user_id)).toEqual(['owner', 'new-admin']);
		expect(provider.state.rows[0].link).toBeNull();
		expect(provider.state.attempts).toHaveLength(2);
	});

	it.each(['user', 'admins'] as const)(
		'reports a returned %s insert failure and permits only an explicit later attempt',
		async (audience) => {
			const provider = notificationTestProvider();
			const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
			const delivery = createSupabaseNotificationDelivery({
				getAdminClient: () => provider.client,
				resolveAdministratorRecipients: async () => ({ userIds: ['recipient'], errorMessage: null })
			});
			const send = () =>
				audience === 'user'
					? delivery.notifyUser('org-a', 'recipient', payload)
					: delivery.notifyAdmins('org-a', null, payload);
			provider.state.failure = { method: 'POST', message: 'write unavailable' };
			await expect(send()).resolves.toBeUndefined();
			expect(provider.state.rows).toEqual([]);
			expect(provider.state.attempts).toHaveLength(1);
			expect(logged).toHaveBeenCalledWith(expect.any(String), 'write unavailable');
			provider.state.failure = null;
			await send();
			expect(provider.state.rows).toHaveLength(1);
			expect(provider.state.rows[0]).toMatchObject({ organization_id: 'org-a', user_id: 'recipient', ...payload });
		}
	);

	it.each(['best-effort', 'required'] as const)(
		'keeps %s returned lookup-error behavior without inserting partial recipients',
		async (failureMode) => {
			const provider = notificationTestProvider();
			const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
			const delivery = createSupabaseNotificationDelivery({
				getAdminClient: () => provider.client,
				resolveAdministratorRecipients: async () => ({ userIds: ['partial'], errorMessage: 'lookup unavailable' }),
				failureMode
			});
			const result = delivery.notifyAdmins('org-a', null, payload);
			if (failureMode === 'required') await expect(result).rejects.toThrow('lookup unavailable');
			else await expect(result).resolves.toBeUndefined();
			expect(provider.state.attempts).toEqual([]);
			if (failureMode === 'best-effort') {
				expect(logged).toHaveBeenCalledWith(expect.any(String), 'lookup unavailable');
			}
		}
	);

	it('propagates required retention insert failure and unexpected lookup/privilege failures', async () => {
		const provider = notificationTestProvider();
		provider.state.failure = { method: 'POST', message: 'retention delivery unavailable' };
		const required = createSupabaseNotificationDelivery({
			getAdminClient: () => provider.client,
			resolveAdministratorRecipients: async () => ({ userIds: ['owner'], errorMessage: null }),
			failureMode: 'required'
		});
		await expect(required.notifyAdmins('org-a', null, payload)).rejects.toThrow('retention delivery unavailable');
		expect(provider.state.rows).toEqual([]);
		const lookupFailure = createSupabaseNotificationDelivery({
			getAdminClient: () => provider.client,
			resolveAdministratorRecipients: async () => {
				throw new Error('unexpected lookup');
			}
		});
		await expect(lookupFailure.notifyAdmins('org-a', null, payload)).rejects.toThrow('unexpected lookup');
		const privilegeFailure = createSupabaseNotificationDelivery({
			getAdminClient: () => {
				throw new Error('privilege unavailable');
			},
			resolveAdministratorRecipients: async () => ({ userIds: [], errorMessage: null })
		});
		await expect(privilegeFailure.notifyUser('org-a', 'user', payload)).rejects.toThrow('privilege unavailable');
	});
});
