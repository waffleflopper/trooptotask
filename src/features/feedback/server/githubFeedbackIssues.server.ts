import { env } from '$env/dynamic/private';
import { z } from 'zod';
import type { FeedbackCategory, FeedbackIssue, FeedbackIssuePrefill } from '../contracts';

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string[]> = {
	bug: ['bug', 'user-feedback'],
	feature: ['enhancement', 'user-feedback'],
	general: ['needs-triage', 'user-feedback']
};

const CATEGORY_TITLES: Record<FeedbackCategory, string> = {
	bug: 'Bug Report',
	feature: 'Feature Request',
	general: 'Feedback'
};

export function buildFeedbackIssuePrefill(
	input: {
		category: FeedbackCategory;
		message: string;
		pageSection: string | null;
		organizationName: string | null;
	},
	includeOrganization = false
): FeedbackIssuePrefill {
	const description = [input.message, '', `Category: ${input.category}`];
	if (input.pageSection) description.push(`Section: ${input.pageSection}`);
	if (includeOrganization && input.organizationName) description.push(`Organization: ${input.organizationName}`);
	return {
		title: `[${CATEGORY_TITLES[input.category]}] ${input.message.split('\n')[0].slice(0, 80)}`,
		description: description.join('\n'),
		labels: [...FEEDBACK_CATEGORY_LABELS[input.category]],
		includeOrganization
	};
}

export interface FeedbackGitHubClient {
	createIssue(input: {
		title: string;
		description: string;
		labels: string[];
	}): Promise<{ status: 'created'; issue: FeedbackIssue } | { status: 'error'; message: string }>;
}

const issueResponse = z.object({
	number: z.number().int().positive(),
	html_url: z.string().regex(/^https:\/\/github\.com\/waffleflopper\/trooptotask\/issues\/\d+$/)
});

export function createGitHubFeedbackClient({
	token = env.GITHUB_FEEDBACK_TOKEN,
	fetcher = fetch
}: { token?: string; fetcher?: typeof fetch } = {}): FeedbackGitHubClient {
	return {
		async createIssue(input) {
			if (!token) return { status: 'error', message: 'GitHub feedback integration is not configured.' };
			try {
				const response = await fetcher('https://api.github.com/repos/waffleflopper/trooptotask/issues', {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${token}`,
						Accept: 'application/vnd.github+json',
						'Content-Type': 'application/json',
						'X-GitHub-Api-Version': '2022-11-28'
					},
					body: JSON.stringify({ title: input.title, body: input.description, labels: input.labels }),
					signal: AbortSignal.timeout(15000)
				});
				if (!response.ok) return { status: 'error', message: `GitHub rejected the issue (HTTP ${response.status}).` };
				const parsed = issueResponse.safeParse(await response.json());
				if (!parsed.success) return { status: 'error', message: 'GitHub returned an invalid issue response.' };
				return { status: 'created', issue: { issueNumber: parsed.data.number, issueUrl: parsed.data.html_url } };
			} catch {
				return { status: 'error', message: 'Unable to reach GitHub. Check GitHub before trying again.' };
			}
		}
	};
}
