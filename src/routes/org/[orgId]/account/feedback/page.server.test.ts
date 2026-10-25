import { describe, expect, it, vi } from 'vitest';
import { feedbackReporterTestProvider } from '$lib/server/adapters/test-support/feedbackReporterProvider.server';
import { load } from './+page.server';

function fixture(actor = true) {
	const provider = feedbackReporterTestProvider('me', [
		{
			id: 'old',
			userId: 'me',
			category: 'bug',
			message: 'Old problem',
			pageUrl: null,
			status: 'new',
			createdAt: '2026-10-23T00:00:00Z',
			replies: []
		},
		{
			id: 'peer',
			userId: 'peer',
			category: 'general',
			message: 'Private',
			pageUrl: null,
			status: 'new',
			createdAt: '2026-10-25T00:00:00Z',
			replies: []
		},
		{
			id: 'recent',
			userId: 'me',
			category: 'feature',
			message: 'New request',
			pageUrl: null,
			status: 'reviewed',
			createdAt: '2026-10-24T00:00:00Z',
			replies: [
				{
					id: 'reply',
					feedbackId: 'recent',
					author: 'operator',
					body: 'Acknowledged',
					sentBy: 'operator',
					sentAt: '2026-10-25T00:00:00Z'
				}
			]
		}
	]);
	return {
		provider,
		run: () =>
			load({
				locals: { actor: actor ? { userId: 'me' } : null, supabase: provider.client },
				url: new URL('http://localhost/org/alpha/account/feedback')
			} as never)
	};
}

describe('Account feedback list', () => {
	it('lists only the signed-in reporter newest first with saved reply counts', async () => {
		await expect(fixture().run()).resolves.toEqual({
			feedback: [
				{
					id: 'recent',
					category: 'feature',
					message: 'New request',
					status: 'reviewed',
					createdAt: '2026-10-24T00:00:00Z',
					replyCount: 1
				},
				{
					id: 'old',
					category: 'bug',
					message: 'Old problem',
					status: 'new',
					createdAt: '2026-10-23T00:00:00Z',
					replyCount: 0
				}
			]
		});
	});
	it('sends a signed-out visitor to sign in', async () => {
		await expect(fixture(false).run()).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?next=%2Forg%2Falpha%2Faccount%2Ffeedback'
		});
	});
	it('reports a failed read rather than an empty list', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const f = fixture();
			f.provider.state.failReads = true;
			await expect(f.run()).rejects.toMatchObject({ status: 503 });
		} finally {
			log.mockRestore();
		}
	});
});
