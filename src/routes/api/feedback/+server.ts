import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { sanitizeString } from '$lib/server/validation';
import { env } from '$env/dynamic/private';

const GITHUB_REPO = 'waffleflopper/trooptotask';

// Map URL path segments to human-readable section names
const SECTION_MAP: Record<string, string> = {
	calendar: 'Calendar',
	'calendar/reports': 'Calendar Reports',
	training: 'Training',
	personnel: 'Personnel',
	'leaders-book': "Leader's Book",
	onboarding: 'Onboarding',
	settings: 'Settings',
	billing: 'Billing',
	audit: 'Audit Log',
	admin: 'Admin',
	'admin/settings': 'Admin Settings',
	'admin/approvals': 'Admin Approvals',
	'admin/audit': 'Admin Audit Log',
	'admin/archived': 'Admin Archived'
};

function getPageSection(pageUrl?: string): string | null {
	if (!pageUrl) return null;
	// Strip /org/<uuid>/ prefix and trailing slashes
	const match = pageUrl.match(/^\/org\/[^/]+\/?(.*?)\/?$/);
	const slug = match?.[1] ?? '';
	if (!slug) return 'Dashboard';
	return SECTION_MAP[slug] ?? slug;
}

const CATEGORY_LABELS: Record<string, string[]> = {
	bug: ['bug', 'user-feedback'],
	feature: ['enhancement', 'user-feedback'],
	general: ['user-feedback']
};

async function createGitHubIssue(params: {
	category: string;
	message: string;
	pageUrl?: string;
	pageSection?: string | null;
	organizationName?: string;
	userEmail?: string;
}): Promise<{ issueNumber: number; issueUrl: string } | null> {
	const token = env.GITHUB_FEEDBACK_TOKEN;
	if (!token) {
		console.warn('GITHUB_FEEDBACK_TOKEN not set — skipping GitHub issue creation');
		return null;
	}

	const categoryTitle: Record<string, string> = {
		bug: 'Bug Report',
		feature: 'Feature Request',
		general: 'Feedback'
	};

	const title = `[${categoryTitle[params.category] || 'Feedback'}] ${params.message.slice(0, 80)}${params.message.length > 80 ? '...' : ''}`;

	const bodyParts = [
		`## ${categoryTitle[params.category] || 'User Feedback'}`,
		'',
		params.message,
		'',
		'---',
		`**Category:** ${params.category}`,
	];

	if (params.pageSection) bodyParts.push(`**Section:** ${params.pageSection}`);
	if (params.pageUrl) bodyParts.push(`**Page:** ${params.pageUrl}`);
	if (params.organizationName) bodyParts.push(`**Organization:** ${params.organizationName}`);
	if (params.userEmail) bodyParts.push(`**Submitted by:** ${params.userEmail}`);
	bodyParts.push(`**Date:** ${new Date().toISOString()}`);

	const labels = CATEGORY_LABELS[params.category] || CATEGORY_LABELS.general;

	const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'Content-Type': 'application/json',
			'X-GitHub-Api-Version': '2022-11-28'
		},
		body: JSON.stringify({ title, body: bodyParts.join('\n'), labels })
	});

	if (!res.ok) {
		const errBody = await res.text().catch(() => 'unknown');
		console.error(`GitHub issue creation failed (${res.status}):`, errBody);
		return null;
	}

	const data = await res.json();
	return { issueNumber: data.number, issueUrl: data.html_url };
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Authentication required');

	const body = await request.json();
	const { category, pageUrl, organizationId, organizationName } = body;
	const message = sanitizeString(body.message, 5000);

	if (!message) {
		throw error(400, 'Message is required');
	}

	if (category && !['bug', 'feature', 'general'].includes(category)) {
		throw error(400, 'Invalid category');
	}

	const pageSection = getPageSection(pageUrl);

	// Create GitHub issue (non-blocking — feedback still saved to DB even if this fails)
	const githubResult = await createGitHubIssue({
		category: category || 'general',
		message,
		pageUrl,
		pageSection,
		organizationName,
		userEmail: user.email
	});

	// Save to database as backup record
	const adminClient = getAdminClient();
	const { error: insertError } = await adminClient.from('beta_feedback').insert({
		user_id: user.id,
		user_email: user.email,
		organization_id: organizationId || null,
		organization_name: organizationName || null,
		category: category || 'general',
		message,
		page_url: pageUrl || null,
		page_section: pageSection || null,
		github_issue_number: githubResult?.issueNumber || null,
		github_issue_url: githubResult?.issueUrl || null
	});

	if (insertError) {
		console.error('Failed to insert feedback:', insertError);
		// If GitHub issue was created, still return success
		if (githubResult) {
			return json({ success: true, githubIssue: githubResult.issueUrl });
		}
		throw error(500, 'Failed to submit feedback');
	}

	return json({ success: true, githubIssue: githubResult?.issueUrl || null });
};
