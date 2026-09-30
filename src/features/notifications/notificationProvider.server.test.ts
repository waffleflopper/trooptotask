import { describe, expect, it } from 'vitest';
import { createSupabaseNotificationStore } from './notificationProvider.server';
import { notificationTestProvider, savedNotification } from './notificationTestProvider.server';

describe('notification request provider', () => {
	it('lists the newest twenty own Organization rows while count and export include the outside-page rows', async () => {
		const own = Array.from({ length: 24 }, (_, index) =>
			savedNotification(`own-${index + 1}`, { created_at: `2026-09-${String(index + 1).padStart(2, '0')}T10:00:00Z` })
		);
		const provider = notificationTestProvider([
			...own,
			savedNotification('peer', { user_id: 'peer-user' }),
			savedNotification('other-org', { organization_id: 'org-b' })
		]);
		const store = createSupabaseNotificationStore(provider.client);
		expect((await store.listOwn('org-a', 'own-user')).map(({ id }) => id)).toEqual([
			'own-24',
			'own-23',
			'own-22',
			'own-21',
			'own-20',
			'own-19',
			'own-18',
			'own-17',
			'own-16',
			'own-15',
			'own-14',
			'own-13',
			'own-12',
			'own-11',
			'own-10',
			'own-9',
			'own-8',
			'own-7',
			'own-6',
			'own-5'
		]);
		expect(await store.countOwnUnread('org-a', 'own-user')).toBe(24);
		expect(await store.listOwnExportRows('org-a', 'own-user')).toEqual(own);
	});

	it('reads all unread/export pages and preserves every saved export field', async () => {
		const rows = Array.from({ length: 1002 }, (_, index) => savedNotification(`note-${index}`));
		rows[1001] = savedNotification('last-page', { type: 'member_removed', link: '/org/org-a/settings', read: true });
		const provider = notificationTestProvider([...rows, savedNotification('other', { organization_id: 'org-b' })]);
		const store = createSupabaseNotificationStore(provider.client);
		expect(await store.listOwnExportRows('org-a', 'own-user')).toEqual(rows);
		const unread = await store.listOwnUnreadIds('org-a', 'own-user');
		expect(unread).toHaveLength(1001);
		expect(unread).toContain('note-1000');
		expect(unread).not.toContain('last-page');
	});

	it('keeps request-client concealed peers/missing rows null and scopes single and all mutations', async () => {
		const provider = notificationTestProvider(
			[
				savedNotification('own'),
				savedNotification('peer', { user_id: 'peer-user' }),
				savedNotification('own-b', { organization_id: 'org-b' })
			],
			'own-user'
		);
		const store = createSupabaseNotificationStore(provider.client);
		expect(await store.findNotification('org-a', 'peer')).toBeNull();
		expect(await store.findNotification('org-a', 'missing')).toBeNull();
		await store.markRead('org-a', 'own');
		expect(provider.state.rows.find(({ id }) => id === 'own')?.read).toBe(true);
		expect(provider.state.rows.find(({ id }) => id === 'own-b')?.read).toBe(false);
		await store.deleteNotification('org-a', 'own-b');
		expect(provider.state.rows.map(({ id }) => id)).toContain('own-b');
		await store.deleteOwn('org-a', 'own-user');
		expect(provider.state.rows.map(({ id }) => id)).toEqual(['peer', 'own-b']);
	});

	it('propagates provider mutation failures without changing rows and permits an explicit retry', async () => {
		const provider = notificationTestProvider([savedNotification('own')]);
		const store = createSupabaseNotificationStore(provider.client);
		provider.state.failure = { method: 'PATCH', message: 'write unavailable' };
		await expect(store.markRead('org-a', 'own')).rejects.toThrow('write unavailable');
		expect(provider.state.rows[0].read).toBe(false);
		provider.state.failure = null;
		await store.markRead('org-a', 'own');
		expect(provider.state.rows[0].read).toBe(true);
		provider.state.failure = { method: 'HEAD', message: 'count unavailable' };
		await expect(store.countOwnUnread('org-a', 'own-user')).rejects.toThrow('count unavailable');
	});
});
