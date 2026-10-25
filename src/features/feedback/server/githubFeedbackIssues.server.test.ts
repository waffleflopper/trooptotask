import { describe, expect, it, vi } from 'vitest';
import { buildFeedbackIssuePrefill, createGitHubFeedbackClient } from './githubFeedbackIssues.server';

const source = {
	category: 'bug',
	message: 'Calendar selection disappeared',
	pageSection: 'Calendar',
	organizationName: 'Private Organization',
	userEmail: 'private@example.test',
	userName: 'Private Person',
	pageUrl: '/org/private-organization/calendar?person=Private%20Person'
} as const;

describe('Feedback GitHub issues', () => {
	it('prefills message context without identity, Organization or a revealing page URL', () => {
		const prefill = buildFeedbackIssuePrefill(source);
		expect(prefill).toEqual({
			title: '[Bug Report] Calendar selection disappeared',
			description: 'Calendar selection disappeared\n\nCategory: bug\nSection: Calendar',
			labels: ['bug', 'user-feedback'],
			includeOrganization: false
		});
		const included = buildFeedbackIssuePrefill(source, true);
		expect(included.description).toContain('Organization: Private Organization');
		expect(included.description).not.toContain('private@example.test');
		expect(included.description).not.toContain('Private Person');
	});

	it('creates the deliberate issue and returns the validated issue link', async () => {
		let sent: unknown;
		const client = createGitHubFeedbackClient({
			token: 'synthetic-token',
			fetcher: async (_url, init) => {
				sent = JSON.parse(String(init?.body));
				return Response.json(
					{ number: 42, html_url: 'https://github.com/waffleflopper/trooptotask/issues/42' },
					{ status: 201 }
				);
			}
		});
		await expect(client.createIssue(buildFeedbackIssuePrefill(source))).resolves.toEqual({
			status: 'created',
			issue: { issueNumber: 42, issueUrl: 'https://github.com/waffleflopper/trooptotask/issues/42' }
		});
		expect(sent).toEqual({
			title: '[Bug Report] Calendar selection disappeared',
			body: 'Calendar selection disappeared\n\nCategory: bug\nSection: Calendar',
			labels: ['bug', 'user-feedback']
		});
	});

	it('reports a missing token without calling GitHub', async () => {
		const fetcher = vi.fn<typeof fetch>();
		await expect(
			createGitHubFeedbackClient({ token: '', fetcher }).createIssue(buildFeedbackIssuePrefill(source))
		).resolves.toMatchObject({ status: 'error' });
		expect(fetcher).not.toHaveBeenCalled();
	});

	it.each(['http', 'transport', 'malformed', 'foreignUrl', 'invalidJson'])('reports %s failures', async (failure) => {
		const client = createGitHubFeedbackClient({
			token: 'synthetic-token',
			fetcher: async () => {
				if (failure === 'transport') throw new Error('network unavailable');
				if (failure === 'http') return new Response('provider refused', { status: 422 });
				if (failure === 'invalidJson') return new Response('not JSON', { status: 201 });
				return Response.json(
					{ number: failure === 'malformed' ? '42' : 42, html_url: 'https://evil.example/issues/42' },
					{ status: 201 }
				);
			}
		});
		await expect(client.createIssue(buildFeedbackIssuePrefill(source))).resolves.toMatchObject({
			status: 'error',
			message: expect.any(String)
		});
	});
});
