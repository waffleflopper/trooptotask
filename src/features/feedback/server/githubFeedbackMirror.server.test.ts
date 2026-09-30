import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubFeedbackMirror } from './githubFeedbackMirror.server';

afterEach(() => vi.restoreAllMocks());

describe('createGitHubFeedbackMirror', () => {
	it('omits submitter email from mirrored GitHub issue bodies', async () => {
		const fetcher = vi.fn<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>(
			async () =>
				new Response(
					JSON.stringify({
						number: 42,
						html_url: 'https://github.com/waffleflopper/trooptotask/issues/42'
					}),
					{ status: 201, headers: { 'Content-Type': 'application/json' } }
				)
		);
		const mirror = createGitHubFeedbackMirror({
			token: 'feedback-token',
			fetcher
		});

		await expect(
			mirror.mirror({
				category: 'bug',
				message: 'Dashboard cards flicker.',
				pageSection: 'Dashboard',
				pageUrl: '/org/alpha-company/dashboard',
				organizationName: 'Alpha Company',
				userEmail: 'member@example.com'
			})
		).resolves.toEqual({
			issueNumber: 42,
			issueUrl: 'https://github.com/waffleflopper/trooptotask/issues/42'
		});

		const requestBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body ?? '{}')) as { body?: string };
		expect(requestBody.body).toContain('**Organization:** Alpha Company');
		expect(requestBody.body).not.toContain('member@example.com');
		expect(requestBody.body).not.toContain('Submitted by');
	});

	it('does not make an external request without a configured token', async () => {
		const logged = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fetcher = vi.fn<typeof fetch>();
		const mirror = createGitHubFeedbackMirror({ token: '', fetcher });

		await expect(
			mirror.mirror({
				category: 'general',
				message: 'Please help',
				pageUrl: null,
				pageSection: null,
				organizationName: null,
				userEmail: null
			})
		).resolves.toBeNull();
		expect(fetcher).not.toHaveBeenCalled();
		expect(logged).toHaveBeenCalledWith(expect.any(String));
	});

	it.each(['rejected', 'unavailable', 'malformed'] as const)(
		'returns no mirror result on a %s provider outcome',
		async (outcome) => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const fetcher = vi.fn<typeof fetch>(async () => {
				if (outcome === 'unavailable') throw new Error('transport unavailable');
				return outcome === 'rejected'
					? new Response('provider rejected', { status: 503 })
					: new Response(JSON.stringify({ number: '42', html_url: null }), { status: 201 });
			});
			const mirror = createGitHubFeedbackMirror({ token: 'test-token', fetcher });

			await expect(
				mirror.mirror({
					category: 'bug',
					message: 'Please help',
					pageUrl: null,
					pageSection: null,
					organizationName: null,
					userEmail: null
				})
			).resolves.toBeNull();
		}
	);
});
