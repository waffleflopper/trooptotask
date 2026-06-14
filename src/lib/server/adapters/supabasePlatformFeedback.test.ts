import { describe, expect, it, vi } from 'vitest';
import { createGitHubPlatformFeedbackMirror } from './supabasePlatformFeedback';

describe('createGitHubPlatformFeedbackMirror', () => {
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
		const mirror = createGitHubPlatformFeedbackMirror({
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
});
