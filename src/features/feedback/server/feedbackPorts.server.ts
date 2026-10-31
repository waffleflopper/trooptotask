import type {
	FeedbackCategory,
	FeedbackItem,
	FeedbackSubmissionInput,
	FeedbackSubmitResult,
	FeedbackStatus,
	FeedbackUpdateInput,
	FeedbackUpdateResult
} from '../contracts';
import type { ReporterFeedback, ReporterFeedbackSummary, ReporterFeedbackReplyResult } from '../contracts';

export interface ReporterFeedbackReader {
	detail(id: string, userId: string): Promise<ReporterFeedback | null>;
	list(userId: string): Promise<ReporterFeedbackSummary[]>;
	reply(input: { feedbackId: string; body: string }): Promise<ReporterFeedbackReplyResult>;
}

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
	userEmail: string;
	organizationId: string | null;
	organizationName: string | null;
	category: FeedbackCategory;
	message: string;
	pageUrl: string | null;
	pageSection: string | null;
}

export interface FeedbackSubmissionStore {
	insertFeedbackSubmission(input: FeedbackSubmissionRecord): Promise<void>;
}

export interface FeedbackSubmissionDependencies {
	store: FeedbackSubmissionStore;
	resolveOrganizationContext?(input: {
		userId: string;
		organizationId: string;
	}): Promise<FeedbackOrganizationContext | null>;
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
