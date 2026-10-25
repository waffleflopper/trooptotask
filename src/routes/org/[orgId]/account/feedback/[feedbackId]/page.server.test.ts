import { describe, expect, it, vi } from 'vitest';
import type { ReporterFeedback } from '$features/feedback/contracts';
import { feedbackReporterTestProvider } from '$lib/server/adapters/test-support/feedbackReporterProvider.server';
import { actions, load } from './+page.server';

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

function fixture(options: { owner?: string; status?: ReporterFeedback['status']; actor?: boolean; id?: string } = {}) {
	const provider = feedbackReporterTestProvider('me', [
		{ ...feedback, userId: options.owner ?? 'me', status: options.status ?? 'reviewed' }
	]);
	const url = new URL(`http://localhost/org/alpha/account/feedback/${options.id ?? ID}`);
	const event = {
		locals: { actor: options.actor === false ? null : { userId: 'me' }, supabase: provider.client },
		params: { feedbackId: options.id ?? ID },
		url
	};
	const reply = (body: string | File = '  Here is more detail  ') => {
		const form = new FormData();
		form.set('body', body);
		form.set('author', 'operator');
		form.set('sentBy', 'forged');
		return actions.reply({ ...event, request: new Request(url, { method: 'POST', body: form }) } as never);
	};
	return { provider, read: () => load(event as never), reply };
}

describe('Account feedback thread', () => {
	it('loads the reporter thread and returns a trimmed, session-attributed reply that persists on reload', async () => {
		const f = fixture();
		await expect(f.read()).resolves.toEqual({ feedback });
		await expect(f.reply()).resolves.toEqual({
			reply: {
				id: 'reply-1',
				feedbackId: ID,
				author: 'reporter',
				body: 'Here is more detail',
				sentBy: 'me',
				sentAt: '2026-10-25T12:00:00Z'
			}
		});
		await expect(f.read()).resolves.toEqual({
			feedback: {
				...feedback,
				status: 'new',
				replies: [
					{
						id: 'reply-1',
						feedbackId: ID,
						author: 'reporter',
						body: 'Here is more detail',
						sentBy: 'me',
						sentAt: '2026-10-25T12:00:00Z'
					}
				]
			}
		});
	});

	it('redirects signed-out reads and replies to sign in', async () => {
		const f = fixture({ actor: false });
		await expect(f.read()).rejects.toMatchObject({
			status: 303,
			location: `/auth/login?next=${encodeURIComponent(`/org/alpha/account/feedback/${ID}`)}`
		});
		await expect(f.reply()).rejects.toMatchObject({ status: 303, location: '/auth/login' });
		expect(f.provider.state.feedback[0].replies).toEqual([]);
	});

	it.each([{ owner: 'peer' }, { id: '50000000-0000-4000-8000-000000186912' }, { id: 'not-a-uuid' }])(
		'conceals an inaccessible thread %j in reads and replies',
		async (options) => {
			const f = fixture(options);
			await expect(f.read()).rejects.toMatchObject({ status: 404 });
			await expect(f.reply()).resolves.toMatchObject({ status: 404, data: { message: expect.any(String) } });
			expect(f.provider.state.feedback[0].replies).toEqual([]);
		}
	);

	it('returns a conflict when the operator has closed the thread and leaves it resolved', async () => {
		const f = fixture({ status: 'resolved' });
		await expect(f.reply()).resolves.toMatchObject({ status: 409, data: { message: expect.any(String) } });
		await expect(f.read()).resolves.toEqual({ feedback: { ...feedback, status: 'resolved' } });
	});

	it.each(['', '   ', 'a'.repeat(5001), new File(['unexpected'], 'body.txt')])(
		'rejects an invalid reply before persistence',
		async (body) => {
			const f = fixture();
			await expect(f.reply(body)).resolves.toMatchObject({ status: 400, data: { message: expect.any(String) } });
			expect(f.provider.state.feedback[0].replies).toEqual([]);
		}
	);

	it('accepts the maximum reply length', async () => {
		const f = fixture();
		await expect(f.reply('a'.repeat(5000))).resolves.toMatchObject({ reply: { body: 'a'.repeat(5000) } });
	});

	it('keeps read and reply provider failures retryable', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const f = fixture();
			f.provider.state.failReads = true;
			f.provider.state.failReplies = true;
			await expect(f.read()).rejects.toMatchObject({ status: 503 });
			await expect(f.reply()).resolves.toMatchObject({ status: 503, data: { message: expect.any(String) } });
			f.provider.state.failReads = false;
			f.provider.state.failReplies = false;
			await expect(f.reply('Retry')).resolves.toMatchObject({ reply: { body: 'Retry' } });
		} finally {
			log.mockRestore();
		}
	});
});
