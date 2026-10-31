import { sanitizeString, validateUUID } from '$lib/server/validation';
import type { FeedbackCategory } from '../contracts';
import type {
	FeedbackOrganizationContext,
	FeedbackSubmission,
	FeedbackSubmissionDependencies
} from './feedbackPorts.server';

const VALID_SUBMISSION_CATEGORIES: readonly FeedbackCategory[] = ['bug', 'feature', 'general'];

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
	audit: 'Audit Log',
	admin: 'Admin'
};

function normalizeSubmissionCategory(category: unknown): FeedbackCategory | null {
	if (!category) return 'general';
	if (typeof category !== 'string') return null;
	if (!VALID_SUBMISSION_CATEGORIES.includes(category as FeedbackCategory)) return null;
	return category as FeedbackCategory;
}

function normalizeFeedbackPageUrl(pageUrl: unknown, organizationSegments: readonly string[] = []): string | null {
	if (typeof pageUrl !== 'string') return null;

	const trimmed = pageUrl.trim();
	if (!trimmed) return null;

	const normalizePath = (path: string) => {
		if (!path.startsWith('/') || path.startsWith('//')) return null;
		if (organizationSegments.length > 0) {
			const orgSegment = path.match(/^\/org\/([^/?#]+)(?=$|[/?#])/)?.[1];
			if (!orgSegment || !organizationSegments.includes(orgSegment)) return null;
		}
		return path;
	};

	if (trimmed.startsWith('/')) {
		return normalizePath(trimmed);
	}

	if (organizationSegments.length === 0) return null;

	try {
		const parsed = new URL(trimmed);
		return normalizePath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
	} catch {
		return null;
	}
}

function getPageSection(pageUrl: string | null): string | null {
	if (!pageUrl) return null;
	const pagePath = pageUrl.split(/[?#]/, 1)[0];
	const match = pagePath.match(/^\/org\/[^/]+\/?(.*?)\/?$/);
	const slug = match?.[1] ?? '';
	if (!slug) return 'Dashboard';
	return SECTION_MAP[slug] ?? slug;
}

export function createFeedbackSubmission(deps: FeedbackSubmissionDependencies): FeedbackSubmission {
	return {
		async submit(input) {
			const message = sanitizeString(typeof input.message === 'string' ? input.message : null, 5000);
			if (!message) {
				return { status: 'validation_error', message: 'Message is required' };
			}

			const category = normalizeSubmissionCategory(input.category);
			if (!category) {
				return { status: 'validation_error', message: 'Invalid category' };
			}

			const userEmail = input.userEmail?.trim();
			if (!userEmail) {
				return { status: 'validation_error', message: 'An account email is required to send feedback' };
			}

			let organizationContext: FeedbackOrganizationContext | null = null;
			if (input.organizationId) {
				if (typeof input.organizationId !== 'string' || !validateUUID(input.organizationId)) {
					return { status: 'validation_error', message: 'Invalid organization ID' };
				}
				if (!deps.resolveOrganizationContext) {
					console.error('Feedback organization context dependency is not configured');
					return { status: 'submission_failed', message: 'Failed to submit feedback' };
				}

				try {
					organizationContext = await deps.resolveOrganizationContext({
						userId: input.userId,
						organizationId: input.organizationId
					});
				} catch (error) {
					console.error('Failed to resolve feedback organization context:', error);
					return { status: 'submission_failed', message: 'Failed to submit feedback' };
				}

				if (!organizationContext) {
					return { status: 'organization_access_denied', message: 'Organization access denied' };
				}
			}

			const organizationSegments = organizationContext
				? [organizationContext.organizationId, organizationContext.organizationUrlSlug].filter(
						(segment): segment is string => Boolean(segment)
					)
				: [];
			const pageUrl = normalizeFeedbackPageUrl(input.pageUrl, organizationSegments);
			const pageSection = getPageSection(pageUrl);
			const organizationId = organizationContext?.organizationId ?? null;
			const organizationName = organizationContext?.organizationName ?? null;

			try {
				await deps.store.insertFeedbackSubmission({
					userId: input.userId,
					userEmail,
					organizationId,
					organizationName,
					category,
					message,
					pageUrl,
					pageSection
				});
			} catch (error) {
				console.error('Failed to insert feedback:', error);
				return { status: 'submission_failed', message: 'Failed to submit feedback' };
			}

			return { status: 'submitted', githubIssue: null };
		}
	};
}
