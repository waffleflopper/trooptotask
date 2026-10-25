import { beforeEach, describe, expect, it, vi } from 'vitest';

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('$lib/server/adapters/feedbackDelivery.server', () => ({
	createRequestReporterFeedback: (_locals: unknown, userId: string) => ({ detail: vi.fn(), list: () => list(userId) })
}));

import { load } from './+page.server';

const run = (actor: unknown) =>
	load({ locals: { actor, supabase: {} }, url: new URL('http://localhost/feedback') } as never);

beforeEach(() => {
	list.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('reporter feedback list load', () => {
	it("lists the signed-in account's own feedback", async () => {
		list.mockResolvedValue([{ id: 'a' }]);
		await expect(run({ userId: 'me' })).resolves.toEqual({ feedback: [{ id: 'a' }] });
		expect(list).toHaveBeenCalledWith('me');
	});

	it('sends a signed-out visitor to sign in', async () => {
		await expect(run(null)).rejects.toMatchObject({ status: 303, location: '/auth/login?next=%2Ffeedback' });
		expect(list).not.toHaveBeenCalled();
	});

	it('reports a failed read as an error, never as an empty list', async () => {
		list.mockRejectedValue(new Error('provider down'));
		await expect(run({ userId: 'me' })).rejects.toMatchObject({ status: 503 });
	});
});
