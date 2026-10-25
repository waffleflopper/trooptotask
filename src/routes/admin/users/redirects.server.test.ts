import { describe, expect, it, vi } from 'vitest';

const { createOperations } = vi.hoisted(() => ({ createOperations: vi.fn() }));
vi.mock('$features/platform-admin/index.server', () => ({ createPlatformPeopleOperations: createOperations }));

import { GET as directory } from './+server';
import { GET as account } from './[userId]/+server';

const ID = '11111111-1111-4111-8111-111111111111';
const call = (handler: (event: never) => unknown, event: object) =>
	Promise.resolve().then(() => handler(event as never));

describe('retired Users routes', () => {
	it('sends the old directory to People with its query', async () => {
		createOperations.mockResolvedValue({});
		await expect(
			call(directory, { url: new URL('https://app.example.test/admin/users?search=dana&page=2') })
		).rejects.toMatchObject({ status: 308, location: '/admin/people?search=dana&page=2' });
	});

	it('sends an old account link to the same person', async () => {
		createOperations.mockResolvedValue({});
		await expect(
			call(account, { params: { userId: ID }, url: new URL(`https://app.example.test/admin/users/${ID}`) })
		).rejects.toMatchObject({ status: 308, location: `/admin/people/${ID}` });
	});

	it('rejects a link that names no account', async () => {
		createOperations.mockResolvedValue({});
		await expect(
			call(account, { params: { userId: 'nope' }, url: new URL('https://app.example.test/admin/users/nope') })
		).rejects.toMatchObject({ status: 400 });
	});

	it('does not reveal where a link leads to someone who is not a platform admin', async () => {
		createOperations.mockRejectedValue({ status: 403 });
		await expect(call(directory, { url: new URL('https://app.example.test/admin/users') })).rejects.toMatchObject({
			status: 403
		});
		await expect(
			call(account, { params: { userId: ID }, url: new URL(`https://app.example.test/admin/users/${ID}`) })
		).rejects.toMatchObject({ status: 403 });
	});
});
