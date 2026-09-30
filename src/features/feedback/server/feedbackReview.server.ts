import type { FeedbackReview, FeedbackReviewStore } from './feedbackPorts.server';

/** Platform admission remains with delivery; this owner retains saved-row review behavior. */
export function createFeedbackReview(store: FeedbackReviewStore): FeedbackReview {
	return {
		async list() {
			try {
				return await store.listFeedback();
			} catch (error) {
				console.error('Failed to fetch feedback:', error);
				return [];
			}
		},
		async update(input) {
			const result = await store.updateFeedback(input);
			if (!result) return { status: 'not_found' };
			return { status: 'updated', id: result.id };
		}
	};
}
