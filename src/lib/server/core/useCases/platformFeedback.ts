export type PlatformFeedbackStatus = 'new' | 'reviewed' | 'resolved';

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

export interface PlatformFeedbackDependencies {
	store: PlatformFeedbackStore;
}

export type PlatformFeedbackUpdateResult = { status: 'updated'; id: string } | { status: 'not_found' };

export interface PlatformFeedback {
	list(): Promise<PlatformFeedbackItem[]>;
	update(input: PlatformFeedbackUpdateInput): Promise<PlatformFeedbackUpdateResult>;
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
		}
	};
}
