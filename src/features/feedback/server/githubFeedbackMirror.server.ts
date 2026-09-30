import { env } from '$env/dynamic/private';
import type { FeedbackCategory } from '../contracts';
import type { FeedbackMirror, FeedbackMirrorInput } from './feedbackPorts.server';

const GITHUB_REPO = 'waffleflopper/trooptotask';

const CATEGORY_LABELS: Record<FeedbackCategory, string[]> = {
	bug: ['bug', 'user-feedback'],
	feature: ['enhancement', 'user-feedback'],
	general: ['user-feedback']
};

const CATEGORY_TITLES: Record<FeedbackCategory, string> = {
	bug: 'Bug Report',
	feature: 'Feature Request',
	general: 'Feedback'
};

function createGitHubIssueBody(input: FeedbackMirrorInput): string {
	const categoryTitle = CATEGORY_TITLES[input.category];
	const bodyParts = ['', input.message, '', '---', `**Category:** ${input.category}`];

	if (input.pageSection) bodyParts.push(`**Section:** ${input.pageSection}`);
	if (input.pageUrl) bodyParts.push(`**Page:** ${input.pageUrl}`);
	if (input.organizationName) bodyParts.push(`**Organization:** ${input.organizationName}`);
	bodyParts.push(`**Date:** ${new Date().toISOString()}`);

	return [`## ${categoryTitle}`, ...bodyParts].join('\n');
}

export function createGitHubFeedbackMirror({
	token = env.GITHUB_FEEDBACK_TOKEN,
	fetcher = fetch
}: {
	token?: string;
	fetcher?: typeof fetch;
} = {}): FeedbackMirror {
	return {
		async mirror(input) {
			if (!token) {
				console.warn('GITHUB_FEEDBACK_TOKEN not set - skipping GitHub issue creation');
				return null;
			}

			const categoryTitle = CATEGORY_TITLES[input.category];
			const title = `[${categoryTitle}] ${input.message.slice(0, 80)}${input.message.length > 80 ? '...' : ''}`;

			try {
				const res = await fetcher(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${token}`,
						Accept: 'application/vnd.github+json',
						'Content-Type': 'application/json',
						'X-GitHub-Api-Version': '2022-11-28'
					},
					body: JSON.stringify({
						title,
						body: createGitHubIssueBody(input),
						labels: CATEGORY_LABELS[input.category]
					})
				});

				if (!res.ok) {
					const errBody = await res.text().catch(() => 'unknown');
					console.error(`GitHub issue creation failed (${res.status}):`, errBody);
					return null;
				}

				const data = (await res.json()) as { number?: unknown; html_url?: unknown };
				if (typeof data.number !== 'number' || typeof data.html_url !== 'string') return null;
				return { issueNumber: data.number, issueUrl: data.html_url };
			} catch (error) {
				console.error('GitHub issue creation failed:', error);
				return null;
			}
		}
	};
}
