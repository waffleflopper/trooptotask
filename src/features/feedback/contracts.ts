export type FeedbackStatus = 'new' | 'reviewed' | 'resolved';
export type FeedbackCategory = 'bug' | 'feature' | 'general';

export interface FeedbackItem {
	id: string;
	userEmail: string;
	category: string;
	message: string;
	createdAt: string;
	organizationName: string | null;
	pageUrl: string | null;
	status: FeedbackStatus;
	adminNotes: string | null;
}

export interface FeedbackUpdateInput {
	id: string;
	status?: FeedbackStatus;
	adminNotes?: string | null;
}

export type FeedbackUpdateResult = { status: 'updated'; id: string } | { status: 'not_found' };

export interface FeedbackSubmissionInput {
	/** Supplied by delivery from the admitted account, never from request input. */
	userId: string;
	userEmail?: string | null;
	category?: unknown;
	message?: unknown;
	pageUrl?: unknown;
	organizationId?: unknown;
}

export type FeedbackSubmitResult =
	| { status: 'submitted'; githubIssue: string | null }
	| { status: 'validation_error'; message: string }
	| { status: 'organization_access_denied'; message: string }
	| { status: 'submission_failed'; message: string };
