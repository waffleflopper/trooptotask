import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listUsers, createOperations } = vi.hoisted(() => ({ listUsers: vi.fn(), createOperations: vi.fn() }));
vi.mock('$features/platform-admin/index.server', () => ({ createPlatformAccountOperations: createOperations }));
import { load } from './+page.server';

describe('User directory HTTP delivery', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		createOperations.mockResolvedValue({ listUsers });
		listUsers.mockResolvedValue({ users: [], totalCount: 0, page: 1, limit: 20, search: '', authError: null });
	});

	it('preserves search and the current twenty-account page request', async () => {
		const request = { url: new URL('https://app.example.test/admin/users?search=soldier%40example.test&page=3') };
		const page = {
			users: [{ id: 'account-a' }],
			totalCount: 41,
			page: 3,
			limit: 20,
			search: 'soldier@example.test',
			authError: null
		};
		listUsers.mockResolvedValueOnce(page);
		await expect(load(request as never)).resolves.toEqual(page);
		expect(listUsers).toHaveBeenCalledWith({ search: 'soldier@example.test', page: 3, limit: 20 });
	});

	it.each(['', '0', '-1', 'invalid'])('falls back to the first page for %s', async (page) => {
		await load({ url: new URL(`https://app.example.test/admin/users?page=${page}`) } as never);
		expect(listUsers).toHaveBeenCalledWith({ search: '', page: 1, limit: 20 });
	});

	it('preserves the source unavailable result so the page can report the failure', async () => {
		const page = {
			users: [],
			totalCount: 0,
			page: 1,
			limit: 20,
			search: '',
			authError: 'Unable to load platform accounts'
		};
		listUsers.mockResolvedValueOnce(page);
		await expect(load({ url: new URL('https://app.example.test/admin/users') } as never)).resolves.toEqual(page);
	});

	it('admits the request before reading directory filters', async () => {
		createOperations.mockRejectedValueOnce({ status: 403 });
		const urlRead = vi.fn();
		await expect(
			load({
				get url() {
					return urlRead();
				}
			} as never)
		).rejects.toMatchObject({ status: 403 });
		expect(urlRead).not.toHaveBeenCalled();
		expect(listUsers).not.toHaveBeenCalled();
	});
});
