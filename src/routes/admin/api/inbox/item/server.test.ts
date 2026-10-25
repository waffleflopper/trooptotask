import { beforeEach, describe, expect, it, vi } from 'vitest';

const { inbox, createInbox } = vi.hoisted(() => ({ inbox: { detail: vi.fn() }, createInbox: vi.fn() }));
vi.mock('$features/platform-admin/index.server', () => ({ createPlatformInboxOperations: createInbox }));
import { GET } from './+server';

const ID = '11111111-1111-4111-8111-111111111111';
const call = (item: string | null) =>
	GET({
		url: new URL(`https://app.example.test/admin/api/inbox/item${item === null ? '' : `?item=${item}`}`)
	} as never);

beforeEach(() => {
	vi.resetAllMocks();
	createInbox.mockResolvedValue(inbox);
});

describe('Inbox item API', () => {
	it('returns the detail of an open item', async () => {
		inbox.detail.mockResolvedValueOnce({ kind: 'feedback', id: ID });

		const response = await call(`feedback:${ID}`);

		expect(inbox.detail).toHaveBeenCalledWith({ kind: 'feedback', id: ID });
		await expect(response.json()).resolves.toEqual({ status: 'ok', detail: { kind: 'feedback', id: ID } });
	});

	it('reports an item that is gone as not found', async () => {
		inbox.detail.mockResolvedValueOnce(null);

		await expect((await call(`accessRequest:${ID}`)).json()).resolves.toEqual({ status: 'notFound' });
	});

	it.each([null, 'feedback', `unknown:${ID}`, 'feedback:not-a-uuid'])('refuses the reference %s', async (item) => {
		await expect(call(item)).rejects.toMatchObject({ status: 400 });
		expect(inbox.detail).not.toHaveBeenCalled();
	});

	it('fails the request when the read fails, so the pane can offer a retry', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		inbox.detail.mockRejectedValueOnce(new Error('database unavailable'));

		await expect(call(`feedback:${ID}`)).rejects.toMatchObject({ status: 500 });
	});

	it('does not read anything for someone who is not admitted', async () => {
		createInbox.mockRejectedValueOnce({ status: 403 });

		await expect(call(`feedback:${ID}`)).rejects.toMatchObject({ status: 403 });
		expect(inbox.detail).not.toHaveBeenCalled();
	});
});
