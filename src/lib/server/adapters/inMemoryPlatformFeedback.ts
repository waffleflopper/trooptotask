import type {
	PlatformFeedbackItem,
	PlatformFeedbackStore,
	PlatformFeedbackUpdateInput,
	PlatformFeedbackStoreUpdateResult
} from '$lib/server/core/useCases/platformFeedback';

interface InMemoryPlatformFeedbackOptions {
	items?: PlatformFeedbackItem[];
	listError?: Error;
	updateError?: Error;
}

function cloneFeedback(item: PlatformFeedbackItem): PlatformFeedbackItem {
	return { ...item };
}

export function createInMemoryPlatformFeedbackStore(
	options: InMemoryPlatformFeedbackOptions = {}
): PlatformFeedbackStore {
	const items = new Map<string, PlatformFeedbackItem>();
	for (const item of options.items ?? []) {
		items.set(item.id, cloneFeedback(item));
	}

	return {
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
				status: input.status ?? existing.status,
				adminNotes: input.adminNotes ?? existing.adminNotes
			};
			items.set(input.id, updated);
			return { id: input.id };
		}
	};
}
