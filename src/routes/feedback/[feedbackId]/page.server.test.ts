import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReporterFeedback } from '$features/feedback/contracts';

const { detail } = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock('$lib/server/adapters/feedbackDelivery.server', () => ({
	createRequestReporterFeedback: () => ({ detail, list: vi.fn() })
}));

import { load } from './+page.server';

const ID = '50000000-0000-4000-8000-000000186911';
const feedback: ReporterFeedback = {
	id: ID,
	category: 'bug',
	message: 'Calendar problem',
	pageUrl: null,
	status: 'reviewed',
	createdAt: '2026-10-25T00:00:00Z',
	replies: []
};

const run = (overrides: { actor?: unknown; feedbackId?: string } = {}) =>
	load({
		locals: { actor: 'actor' in overrides ? overrides.actor : { userId: 'me' }, supabase: {} },
		params: { feedbackId: overrides.feedbackId ?? ID },
		url: new URL(`http://localhost/feedback/${overrides.feedbackId ?? ID}`)
	} as never);

beforeEach(() => {
	detail.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('reporter feedback page load', () => {
	it('sends a signed-out visitor to sign in and back, before reading anything', async () => {
		await expect(run({ actor: null })).rejects.toMatchObject({
			status: 303,
			location: `/auth/login?next=${encodeURIComponent(`/feedback/${ID}`)}`
		});
		expect(detail).not.toHaveBeenCalled();
	});

	it('returns the thread of the signed-in reporter', async () => {
		detail.mockResolvedValue(feedback);
		await expect(run()).resolves.toEqual({ feedback });
		expect(detail).toHaveBeenCalledWith(ID);
	});

	it('conceals feedback the account cannot read behind the same 404 as a missing item', async () => {
		detail.mockResolvedValue(null);
		await expect(run()).rejects.toMatchObject({ status: 404 });
		await expect(run({ feedbackId: 'not-a-uuid' })).rejects.toMatchObject({ status: 404 });
	});

	it('reports an unavailable provider as a retriable error, never as not found', async () => {
		detail.mockRejectedValue(new Error('provider down'));
		await expect(run()).rejects.toMatchObject({ status: 503 });
	});
});
