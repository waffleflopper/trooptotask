import { describe, expect, it, vi } from 'vitest';

const { readPublishedWhatsNew } = vi.hoisted(() => ({ readPublishedWhatsNew: vi.fn() }));
vi.mock('$features/platform-admin/index.server', () => ({ readPublishedWhatsNew }));

import { load } from './+page.server';

describe('What’s new page load', () => {
	it('reads published entries with the signed-in client', async () => {
		const event = { locals: { supabase: {} } };
		readPublishedWhatsNew.mockResolvedValueOnce([{ id: 'a' }]);
		const result = load(event as never) as { entries: Promise<unknown> };
		await expect(result.entries).resolves.toEqual({ status: 'loaded', entries: [{ id: 'a' }] });
		expect(readPublishedWhatsNew).toHaveBeenCalledWith(event, expect.any(Number));
	});

	it('reports a failed read as a load error instead of failing the page', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		readPublishedWhatsNew.mockRejectedValueOnce(new Error('private provider failure'));
		const result = load({ locals: { supabase: {} } } as never) as { entries: Promise<unknown> };
		await expect(result.entries).resolves.toEqual({ status: 'failed' });
		consoleError.mockRestore();
	});
});
