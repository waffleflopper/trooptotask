import { beforeEach, describe, expect, it, vi } from 'vitest';
const { createOperations, list, resolveGroup } = vi.hoisted(() => ({
	createOperations: vi.fn(),
	list: vi.fn(),
	resolveGroup: vi.fn()
}));
vi.mock('$features/platform-admin/index.server', () => ({ createPlatformErrorOperations: createOperations }));
import { runInErrorScope, type StoredErrorOccurrence } from '$features/error-reporting/index.server';
import { actions, load } from './+page.server';

const GROUP_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
	createOperations.mockReset();
	list.mockReset();
	resolveGroup.mockReset();
	createOperations.mockResolvedValue({ adminUserId: 'operator-1', list, resolve: resolveGroup });
});

function resolveEvent(id: string) {
	return {
		request: new Request('https://app.example.test/admin/errors', { method: 'POST', body: new URLSearchParams({ id }) })
	};
}

describe('Errors list', () => {
	it('admits the operator before reading the filter', async () => {
		createOperations.mockRejectedValueOnce({ status: 403 });
		const readUrl = vi.fn();

		await expect(
			load({
				get url() {
					return readUrl();
				}
			} as never)
		).rejects.toMatchObject({ status: 403 });

		expect(readUrl).not.toHaveBeenCalled();
	});

	it.each([
		['', { status: 'open', page: 1 }],
		['?status=resolved&page=3', { status: 'resolved', page: 3 }],
		['?status=anything&page=-4', { status: 'open', page: 1 }],
		['?page=2.5', { status: 'open', page: 1 }]
	])('reads a normalized filter for %s and returns the operator who loaded it', async (query, expected) => {
		list.mockResolvedValue({ status: 'ok', data: { groups: [], total: 0 } });

		const result = await load({
			url: new URL(`https://app.example.test/admin/errors${query}`),
			depends: vi.fn()
		} as never);

		if (!result) throw new Error('Expected the load to return data');
		expect(list).toHaveBeenCalledWith(expected);
		expect(result).toMatchObject({ ...expected, adminUserId: 'operator-1' });
		await expect(result.errors).resolves.toEqual({ status: 'ok', data: { groups: [], total: 0 } });
	});
});

describe('Resolve action', () => {
	it('resolves the group the form names', async () => {
		resolveGroup.mockResolvedValue({ status: 'resolved' });

		await expect(actions.resolve(resolveEvent(GROUP_ID) as never)).resolves.toEqual({ success: true });

		expect(resolveGroup).toHaveBeenCalledWith(GROUP_ID);
	});

	it('rejects an ID that is not a group ID without touching the store', async () => {
		await expect(actions.resolve(resolveEvent('not-an-id') as never)).resolves.toMatchObject({ status: 400 });
		expect(resolveGroup).not.toHaveBeenCalled();
	});

	it('answers 409 for a group that is not open any more', async () => {
		resolveGroup.mockResolvedValue({ status: 'not_open' });

		await expect(actions.resolve(resolveEvent(GROUP_ID) as never)).resolves.toMatchObject({ status: 409 });
	});

	it('answers 500 and says to reload when the resolve or its audit failed', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		resolveGroup.mockRejectedValue(new Error('audit unavailable'));

		const stored: StoredErrorOccurrence[] = [];
		const config = {
			record: async (occurrence: StoredErrorOccurrence) => void stored.push(occurrence),
			routeId: '/admin/errors',
			method: 'POST',
			userId: () => 'operator-1',
			organizationId: async () => null
		};

		const { result } = await runInErrorScope(config, async () => actions.resolve(resolveEvent(GROUP_ID) as never));

		expect(result).toMatchObject({ status: 500, data: { error: expect.stringContaining('Reload') } });
		// An enhanced action failure answers HTTP 200, so the action itself must record it.
		expect(stored).toMatchObject([{ kind: 'server_exception', routeId: '/admin/errors' }]);
	});

	it('is not reachable without operator admission', async () => {
		createOperations.mockRejectedValueOnce({ status: 403 });

		await expect(actions.resolve(resolveEvent(GROUP_ID) as never)).rejects.toMatchObject({ status: 403 });
		expect(resolveGroup).not.toHaveBeenCalled();
	});
});
