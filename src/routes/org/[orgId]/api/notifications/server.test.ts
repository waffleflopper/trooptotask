import { describe, expect, it } from 'vitest';
import type { NotificationStore } from '$features/notifications/index.server';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _putConfig } from './+server';

const OWN_NOTIFICATION = '00000000-0000-4000-8000-00000000c001';
const OTHER_OWN_NOTIFICATION = '00000000-0000-4000-8000-00000000c002';

function ownInbox() {
	const base = createTestContext({ auth: { userId: 'own-user' } });
	const rows = [OWN_NOTIFICATION, OTHER_OWN_NOTIFICATION].map((id) => ({ id, user_id: 'own-user', read: false }));
	const store = {
		findNotification: async (_orgId: string, id: string) => rows.find((row) => row.id === id) ?? null,
		listOwnUnreadIds: async () => rows.filter((row) => !row.read).map((row) => row.id),
		markRead: async (_orgId: string, id: string) => {
			rows.forEach((row) => row.id === id && (row.read = true));
		},
		deleteNotification: async (_orgId: string, id: string) => {
			rows.splice(
				rows.findIndex((row) => row.id === id),
				1
			);
		},
		deleteOwn: async () => {
			rows.length = 0;
		}
	} as Partial<NotificationStore> as NotificationStore;
	const ctx = { auth: base.auth, audit: base.audit, disabledFeatures: [], store };
	return { rows, ctx };
}

describe('/api/notifications commands', () => {
	it('rejects malformed bulk flags and ids with 400 before changing the inbox', async () => {
		const { rows, ctx } = ownInbox();
		const before = structuredClone(rows);

		for (const [body, message] of [
			[{ markAllRead: 'false' }, 'Missing id or markAllRead'],
			[{ id: 'abc' }, 'Invalid ID']
		] as const) {
			await expect(handleUseCaseRequest(_putConfig, ctx, body, () => ctx)).rejects.toMatchObject({
				status: 400,
				message
			});
		}
		for (const [body, message] of [
			[{ deleteAll: 'false' }, 'Missing notification id or deleteAll'],
			[{ id: 'abc' }, 'Invalid ID']
		] as const) {
			await expect(handleUseCaseRequest(_deleteConfig, ctx, body, () => ctx)).rejects.toMatchObject({
				status: 400,
				message
			});
		}
		expect(rows).toEqual(before);
	});

	it('applies a well-formed single and bulk command', async () => {
		const { rows, ctx } = ownInbox();

		await handleUseCaseRequest(_putConfig, ctx, { id: OWN_NOTIFICATION }, () => ctx);
		expect(rows.map(({ read }) => read)).toEqual([true, false]);

		await handleUseCaseRequest(_deleteConfig, ctx, { deleteAll: true }, () => ctx);
		expect(rows).toEqual([]);
	});
});
