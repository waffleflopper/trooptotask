import type {
	PlatformFeedbackItem,
	PlatformFeedbackOrganizationContextStore,
	PlatformFeedbackResolvedOrganizationContext,
	PlatformFeedbackSubmissionRecord,
	PlatformFeedbackSubmissionStore,
	PlatformFeedbackStore,
	PlatformFeedbackUpdateInput,
	PlatformFeedbackStoreUpdateResult
} from '$lib/server/core/useCases/platformFeedback';

interface InMemoryPlatformFeedbackOptions {
	items?: PlatformFeedbackItem[];
	organizationContexts?: Array<
		PlatformFeedbackResolvedOrganizationContext & {
			userId: string;
		}
	>;
	listError?: Error;
	updateError?: Error;
	resolveOrganizationError?: Error;
	insertError?: Error;
}

export interface InMemoryPlatformFeedbackStore
	extends PlatformFeedbackStore, PlatformFeedbackOrganizationContextStore, PlatformFeedbackSubmissionStore {
	readonly submittedFeedback: PlatformFeedbackSubmissionRecord[];
}

function cloneFeedback(item: PlatformFeedbackItem): PlatformFeedbackItem {
	return { ...item };
}

export function createInMemoryPlatformFeedbackStore(
	options: InMemoryPlatformFeedbackOptions = {}
): InMemoryPlatformFeedbackStore {
	const items = new Map<string, PlatformFeedbackItem>();
	for (const item of options.items ?? []) {
		items.set(item.id, cloneFeedback(item));
	}
	const submittedFeedback: PlatformFeedbackSubmissionRecord[] = [];

	return {
		submittedFeedback,

		async listFeedback() {
			if (options.listError) throw options.listError;
			return Array.from(items.values())
				.map(cloneFeedback)
				.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		},

		async updateFeedback(input: PlatformFeedbackUpdateInput): Promise<PlatformFeedbackStoreUpdateResult | null> {
			if (options.updateError) throw options.updateError;
			const existing = items.get(input.id);
			if (!existing) return null;
			const updated: PlatformFeedbackItem = {
				...existing,
				status: input.status !== undefined ? input.status : existing.status,
				adminNotes: input.adminNotes !== undefined ? input.adminNotes : existing.adminNotes
			};
			items.set(input.id, updated);
			return { id: input.id };
		},

		async resolveSubmissionOrganizationContext(input) {
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
