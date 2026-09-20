import { sanitizeString, validateUUID } from '$lib/server/validation';

export type PlatformFeedbackStatus = 'new' | 'reviewed' | 'resolved';
export type PlatformFeedbackSubmissionCategory = 'bug' | 'feature' | 'general';

export interface PlatformFeedbackItem {
	id: string;
	userEmail: string;
	category: string;
	message: string;
	createdAt: string;
	organizationName: string | null;
	pageUrl: string | null;
	status: PlatformFeedbackStatus;
	adminNotes: string | null;
}

export interface PlatformFeedbackUpdateInput {
	id: string;
	status?: PlatformFeedbackStatus;
	adminNotes?: string | null;
}

export interface PlatformFeedbackStoreUpdateResult {
	id: string;
}

export interface PlatformFeedbackStore {
	listFeedback(): Promise<PlatformFeedbackItem[]>;
	updateFeedback(input: PlatformFeedbackUpdateInput): Promise<PlatformFeedbackStoreUpdateResult | null>;
}

export interface PlatformFeedbackSubmissionInput {
	userId: string;
	userEmail?: string | null;
	category?: unknown;
	message?: unknown;
	pageUrl?: unknown;
	organizationId?: unknown;
}

export interface PlatformFeedbackOrganizationContextInput {
	userId: string;
	organizationId: string;
}

export interface PlatformFeedbackResolvedOrganizationContext {
	organizationId: string;
	organizationName: string;
	organizationUrlSlug: string | null;
}

export interface PlatformFeedbackOrganizationContextStore {
	resolveSubmissionOrganizationContext(
		input: PlatformFeedbackOrganizationContextInput
	): Promise<PlatformFeedbackResolvedOrganizationContext | null>;
}

export interface PlatformFeedbackSubmissionRecord {
	userId: string;
	userEmail: string | null;
	organizationId: string | null;
	organizationName: string | null;
	category: PlatformFeedbackSubmissionCategory;
	message: string;
	pageUrl: string | null;
	pageSection: string | null;
	githubIssueNumber: number | null;
	githubIssueUrl: string | null;
}

export interface PlatformFeedbackSubmissionStore {
	insertFeedbackSubmission(input: PlatformFeedbackSubmissionRecord): Promise<void>;
}

export interface PlatformFeedbackMirrorInput {
	category: PlatformFeedbackSubmissionCategory;
	message: string;
	pageUrl: string | null;
	pageSection: string | null;
	organizationName: string | null;
	userEmail: string | null;
}

export interface PlatformFeedbackMirrorResult {
	issueNumber: number;
	issueUrl: string;
}

export interface PlatformFeedbackMirror {
	mirror(input: PlatformFeedbackMirrorInput): Promise<PlatformFeedbackMirrorResult | null>;
}

export interface PlatformFeedbackDependencies {
	store: PlatformFeedbackStore;
	organizationContextStore?: PlatformFeedbackOrganizationContextStore;
	submissionStore?: PlatformFeedbackSubmissionStore;
	mirror?: PlatformFeedbackMirror;
}

export type PlatformFeedbackUpdateResult = { status: 'updated'; id: string } | { status: 'not_found' };
export type PlatformFeedbackSubmitResult =
	| { status: 'submitted'; githubIssue: string | null }
	| { status: 'validation_error'; message: string }
	| { status: 'organization_access_denied'; message: string }
	| { status: 'submission_failed'; message: string };

export interface PlatformFeedback {
	list(): Promise<PlatformFeedbackItem[]>;
	update(input: PlatformFeedbackUpdateInput): Promise<PlatformFeedbackUpdateResult>;
	submit(input: PlatformFeedbackSubmissionInput): Promise<PlatformFeedbackSubmitResult>;
}

const VALID_SUBMISSION_CATEGORIES: readonly PlatformFeedbackSubmissionCategory[] = ['bug', 'feature', 'general'];

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

function normalizeSubmissionCategory(category: unknown): PlatformFeedbackSubmissionCategory | null {
	if (!category) return 'general';
	if (typeof category !== 'string') return null;
	if (!VALID_SUBMISSION_CATEGORIES.includes(category as PlatformFeedbackSubmissionCategory)) return null;
	return category as PlatformFeedbackSubmissionCategory;
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

export function createPlatformFeedback(deps: PlatformFeedbackDependencies): PlatformFeedback {
	return {
		async list() {
			try {
				return await deps.store.listFeedback();
			} catch (error) {
				console.error('Failed to fetch feedback:', error);
				return [];
			}
		},

		async update(input) {
			const result = await deps.store.updateFeedback(input);
			if (!result) return { status: 'not_found' };
			return { status: 'updated', id: result.id };
		},

		async submit(input) {
			const message = sanitizeString(typeof input.message === 'string' ? input.message : null, 5000);
			if (!message) {
				return { status: 'validation_error', message: 'Message is required' };
			}

			const category = normalizeSubmissionCategory(input.category);
			if (!category) {
				return { status: 'validation_error', message: 'Invalid category' };
			}

			if (!deps.submissionStore) {
				console.error('PlatformFeedback submission dependencies are not configured');
				return { status: 'submission_failed', message: 'Failed to submit feedback' };
			}

			let organizationContext: PlatformFeedbackResolvedOrganizationContext | null = null;
			if (input.organizationId) {
				if (typeof input.organizationId !== 'string' || !validateUUID(input.organizationId)) {
					return { status: 'validation_error', message: 'Invalid organization ID' };
				}
				if (!deps.organizationContextStore) {
					console.error('PlatformFeedback organization context dependency is not configured');
					return { status: 'submission_failed', message: 'Failed to submit feedback' };
				}

				try {
					organizationContext = await deps.organizationContextStore.resolveSubmissionOrganizationContext({
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
			const userEmail = input.userEmail ?? null;
			const organizationId = organizationContext?.organizationId ?? null;
			const organizationName = organizationContext?.organizationName ?? null;

			let mirrorResult: PlatformFeedbackMirrorResult | null = null;
			if (deps.mirror) {
				try {
					mirrorResult = await deps.mirror.mirror({
						category,
						message,
						pageUrl,
						pageSection,
						organizationName,
						userEmail
					});
				} catch (error) {
					console.error('Feedback mirror failed:', error);
				}
			}

			try {
				await deps.submissionStore.insertFeedbackSubmission({
					userId: input.userId,
					userEmail,
					organizationId,
					organizationName,
					category,
					message,
					pageUrl,
					pageSection,
					githubIssueNumber: mirrorResult?.issueNumber ?? null,
					githubIssueUrl: mirrorResult?.issueUrl ?? null
				});
			} catch (error) {
				console.error('Failed to insert feedback:', error);
				if (mirrorResult) {
					return { status: 'submitted', githubIssue: mirrorResult.issueUrl };
				}
				return { status: 'submission_failed', message: 'Failed to submit feedback' };
			}

			return { status: 'submitted', githubIssue: mirrorResult?.issueUrl ?? null };
		}
	};
}
