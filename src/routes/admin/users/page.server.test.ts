import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listUsers, createOperations } = vi.hoisted(() => ({ listUsers: vi.fn(), createOperations: vi.fn() }));
vi.mock('$features/platform-admin/index.server', () => ({ createPlatformAccountOperations: createOperations }));
import { load } from './+page.server';

describe('User directory HTTP delivery', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		createOperations.mockResolvedValue({ listUsers });
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
