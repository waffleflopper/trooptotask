import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { sanitizeString, validateUUID } from '$lib/server/validation';
import { env } from '$env/dynamic/private';

const GITHUB_REPO = 'waffleflopper/trooptotask';

// Map URL path segments to human-readable section names
const SECTION_MAP: Record<string, string> = {
	calendar: 'Calendar',
	'calendar/reports': 'Calendar Reports',
	training: 'Training',
	personnel: 'Personnel',
	onboarding: 'Onboarding',
	settings: 'Settings',
	'settings/general': 'Settings',
	'settings/members': 'Settings',
	'settings/policies': 'Settings',
	'settings/archives': 'Settings',
	'settings/approvals': 'Settings',
	'settings/logs': 'Settings',
	'settings/exports': 'Settings',
	'settings/danger': 'Settings',
	billing: 'Billing',
	audit: 'Audit Log',
	admin: 'Admin'
};

function getPageSection(pageUrl?: string): string | null {
	if (!pageUrl) return null;
	const pagePath = pageUrl.split(/[?#]/, 1)[0];
	// Strip /org/<uuid>/ prefix and trailing slashes
	const match = pagePath.match(/^\/org\/[^/]+\/?(.*?)\/?$/);
	const slug = match?.[1] ?? '';
	if (!slug) return 'Dashboard';
	return SECTION_MAP[slug] ?? slug;
}

const CATEGORY_LABELS: Record<string, string[]> = {
	bug: ['bug', 'user-feedback'],
	feature: ['enhancement', 'user-feedback'],
	general: ['user-feedback']
};

interface FeedbackOrganizationMembershipRow {
	organizations:
		| {
				id: string;
				name: string;
		  }
		| {
				id: string;
				name: string;
		  }[]
		| null;
}

interface FeedbackOrganizationContext {
	organizationId: string | null;
	organizationName: string | null;
	pageUrl: string | null;
}

function normalizeFeedbackPageUrl(pageUrl: unknown, organizationId: string | null): string | null {
	if (typeof pageUrl !== 'string') return null;

	const trimmed = pageUrl.trim();
	if (!trimmed) return null;

	const normalizePath = (path: string) => {
		if (!path.startsWith('/') || path.startsWith('//')) return null;
		if (organizationId && !path.startsWith(`/org/${organizationId}`)) return null;
		return path;
	};

	if (trimmed.startsWith('/')) {
		return normalizePath(trimmed);
	}

	if (!organizationId) return null;

	try {
		const parsed = new URL(trimmed);
		return normalizePath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
	} catch {
		return null;
	}
}

async function resolveFeedbackOrganizationContext(
	adminClient: ReturnType<typeof getAdminClient>,
	userId: string,
	organizationId: unknown,
	pageUrl: unknown
): Promise<FeedbackOrganizationContext> {
	if (!organizationId) {
		return {
			organizationId: null,
			organizationName: null,
			pageUrl: normalizeFeedbackPageUrl(pageUrl, null)
		};
	}

	if (typeof organizationId !== 'string' || !validateUUID(organizationId)) {
		throw error(400, 'Invalid organization ID');
	}

	const { data, error: membershipError } = await adminClient
		.from('organization_memberships')
		.select('organizations(id, name)')
		.eq('organization_id', organizationId)
		.eq('user_id', userId)
		.maybeSingle<FeedbackOrganizationMembershipRow>();

	if (membershipError) {
		console.error('Failed to resolve feedback organization context:', membershipError);
		throw error(500, 'Failed to submit feedback');
	}

	const organization = Array.isArray(data?.organizations) ? data?.organizations[0] : data?.organizations;
	if (!organization) {
		throw error(403, 'Organization access denied');
	}

	return {
		organizationId: organization.id,
		organizationName: organization.name,
		pageUrl: normalizeFeedbackPageUrl(pageUrl, organization.id)
	};
}

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
		`**Category:** ${params.category}`
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
	const { category, pageUrl, organizationId } = body;
	const message = sanitizeString(body.message, 5000);

	if (!message) {
		throw error(400, 'Message is required');
	}

	if (category && !['bug', 'feature', 'general'].includes(category)) {
		throw error(400, 'Invalid category');
	}

	const adminClient = getAdminClient();
	const organizationContext = await resolveFeedbackOrganizationContext(adminClient, user.id, organizationId, pageUrl);
	const pageSection = getPageSection(organizationContext.pageUrl ?? undefined);

	// Create GitHub issue (non-blocking — feedback still saved to DB even if this fails)
	const githubResult = await createGitHubIssue({
		category: category || 'general',
		message,
		pageUrl: organizationContext.pageUrl ?? undefined,
		pageSection,
		organizationName: organizationContext.organizationName ?? undefined,
		userEmail: user.email
	});

	// Save to database as backup record
	const { error: insertError } = await adminClient.from('beta_feedback').insert({
		user_id: user.id,
		user_email: user.email,
		organization_id: organizationContext.organizationId,
		organization_name: organizationContext.organizationName,
		category: category || 'general',
		message,
		page_url: organizationContext.pageUrl,
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
