import type {
	FeedbackCategory,
	FeedbackItem,
	FeedbackSubmissionInput,
	FeedbackSubmitResult,
	FeedbackStatus,
	FeedbackUpdateInput,
	FeedbackUpdateResult
} from '../contracts';

export interface FeedbackReviewStore {
	listFeedback(): Promise<FeedbackItem[]>;
	updateFeedback(input: FeedbackUpdateInput): Promise<{ id: string } | null>;
}

export interface FeedbackReview {
	list(): Promise<FeedbackItem[]>;
	update(input: FeedbackUpdateInput): Promise<FeedbackUpdateResult>;
}

/** Facts resolved by Organization's exact account-membership read, bound by delivery. */
export interface FeedbackOrganizationContext {
	organizationId: string;
	organizationName: string;
	organizationUrlSlug: string | null;
}

export interface FeedbackSubmissionRecord {
	userId: string;
	userEmail: string | null;
	organizationId: string | null;
	organizationName: string | null;
	category: FeedbackCategory;
	message: string;
	pageUrl: string | null;
	pageSection: string | null;
	githubIssueNumber: number | null;
	githubIssueUrl: string | null;
}

export interface FeedbackSubmissionStore {
	insertFeedbackSubmission(input: FeedbackSubmissionRecord): Promise<void>;
}

export interface FeedbackMirrorInput {
	category: FeedbackCategory;
	message: string;
	pageUrl: string | null;
	pageSection: string | null;
	organizationName: string | null;
	userEmail: string | null;
}

export interface FeedbackMirrorResult {
	issueNumber: number;
	issueUrl: string;
}

export interface FeedbackMirror {
	mirror(input: FeedbackMirrorInput): Promise<FeedbackMirrorResult | null>;
}

export interface FeedbackSubmissionDependencies {
	store: FeedbackSubmissionStore;
	resolveOrganizationContext?(input: {
		userId: string;
		organizationId: string;
	}): Promise<FeedbackOrganizationContext | null>;
	mirror?: FeedbackMirror;
}

export interface FeedbackSubmission {
	submit(input: FeedbackSubmissionInput): Promise<FeedbackSubmitResult>;
}

/** Exact saved values retained by Organization JSON and workbook exports. */
export type FeedbackExportRow = {
	id: string;
	user_id: string;
	user_email: string;
	organization_id: string | null;
	organization_name: string | null;
	category: FeedbackCategory;
	message: string;
	page_url: string | null;
	status: FeedbackStatus;
	admin_notes: string | null;
	created_at: string;
	updated_at: string;
	github_issue_number: number | null;
	github_issue_url: string | null;
	page_section: string | null;
};
