import type { FeedbackItem, FeedbackUpdateInput } from '../contracts';
import type {
	FeedbackOrganizationContext,
	FeedbackSubmissionRecord,
	FeedbackSubmissionStore,
	FeedbackReviewStore
} from './feedbackPorts.server';

interface FeedbackOrganizationLookup {
	resolveOrganizationContext(input: {
		userId: string;
		organizationId: string;
	}): Promise<FeedbackOrganizationContext | null>;
}

type FeedbackStoreUpdateResult = { id: string };

interface InMemoryFeedbackOptions {
	items?: FeedbackItem[];
	organizationContexts?: Array<
		FeedbackOrganizationContext & {
			userId: string;
		}
	>;
	listError?: Error;
	updateError?: Error;
	resolveOrganizationError?: Error;
	insertError?: Error;
}

export interface InMemoryFeedbackStore
	extends FeedbackReviewStore, FeedbackOrganizationLookup, FeedbackSubmissionStore {
	readonly submittedFeedback: FeedbackSubmissionRecord[];
}

function cloneFeedback(item: FeedbackItem): FeedbackItem {
	return { ...item };
}

export function createInMemoryFeedbackStore(options: InMemoryFeedbackOptions = {}): InMemoryFeedbackStore {
	const items = new Map<string, FeedbackItem>();
	for (const item of options.items ?? []) {
		items.set(item.id, cloneFeedback(item));
	}
	const submittedFeedback: FeedbackSubmissionRecord[] = [];

	return {
		submittedFeedback,

		async listFeedback() {
			if (options.listError) throw options.listError;
			return Array.from(items.values())
				.map(cloneFeedback)
				.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		},

		async updateFeedback(input: FeedbackUpdateInput): Promise<FeedbackStoreUpdateResult | null> {
			if (options.updateError) throw options.updateError;
			const existing = items.get(input.id);
			if (!existing) return null;
			const updated: FeedbackItem = {
				...existing,
				status: input.status !== undefined ? input.status : existing.status,
				adminNotes: input.adminNotes !== undefined ? input.adminNotes : existing.adminNotes
			};
			items.set(input.id, updated);
			return { id: input.id };
		},

		async resolveOrganizationContext(input) {
			if (options.resolveOrganizationError) throw options.resolveOrganizationError;
			const context = options.organizationContexts?.find(
				(candidate) => candidate.userId === input.userId && candidate.organizationId === input.organizationId
			);
			if (!context) return null;
			return {
				organizationId: context.organizationId,
				organizationName: context.organizationName,
				organizationUrlSlug: context.organizationUrlSlug
			};
		},

		async insertFeedbackSubmission(input) {
			if (options.insertError) throw options.insertError;
			submittedFeedback.push({ ...input });
		}
	};
}
