export type FeedbackStatus = 'new' | 'reviewed' | 'resolved';
export type FeedbackCategory = 'bug' | 'feature' | 'general';

export interface FeedbackReply {
	id: string;
	feedbackId: string;
	body: string;
	sentBy: string;
	sentAt: string;
}

export interface FeedbackStaffNote {
	feedbackId: string;
	body: string;
	updatedBy: string | null;
	updatedAt: string;
}

export interface FeedbackIssue {
	issueNumber: number;
	issueUrl: string;
}

export interface FeedbackIssuePrefill {
	title: string;
	description: string;
	labels: string[];
	includeOrganization: boolean;
}

export interface ReporterFeedback {
	id: string;
	category: FeedbackCategory;
	message: string;
	pageUrl: string | null;
	status: FeedbackStatus;
	createdAt: string;
	replies: FeedbackReply[];
}

export interface ReporterFeedbackSummary {
	id: string;
	category: FeedbackCategory;
	message: string;
	status: FeedbackStatus;
	createdAt: string;
	replyCount: number;
}

export interface FeedbackStaffDetail extends ReporterFeedback {
	userId: string;
	userEmail: string;
	organizationId: string | null;
	organizationName: string | null;
	pageSection: string | null;
	staffNotes: FeedbackStaffNote[];
	issue: FeedbackIssue | null;
	issuePrefill: FeedbackIssuePrefill;
}

export type FeedbackStaffCommand =
	| { kind: 'reply' | 'replyAndClose'; body: string }
	| { kind: 'saveNote'; body: string }
	| { kind: 'makeGitHubIssue'; title: string; description: string; includeOrganization: boolean };

export type FeedbackStaffResult =
	| { status: 'replied'; reply: FeedbackReply; feedbackStatus: 'reviewed' | 'resolved' }
	| { status: 'noteSaved' }
	| { status: 'issueCreated'; issue: FeedbackIssue }
	| { status: 'notFound' }
	| { status: 'closed'; message: string }
	| { status: 'issueExists'; issue: FeedbackIssue }
	| { status: 'githubError'; message: string }
	| { status: 'issuePersistenceError'; issue: FeedbackIssue; message: string };

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
	| { status: 'submitted'; githubIssue: null }
	| { status: 'validation_error'; message: string }
	| { status: 'organization_access_denied'; message: string }
	| { status: 'submission_failed'; message: string };
