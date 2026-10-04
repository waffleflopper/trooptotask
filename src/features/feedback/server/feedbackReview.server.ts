import type { FeedbackReview, FeedbackReviewStore } from './feedbackPorts.server';

export function createFeedbackReview(store: FeedbackReviewStore): FeedbackReview {
	return {
		list: () => store.listFeedback(),
		async update(input) {
			const result = await store.updateFeedback(input);
			if (!result) return { status: 'not_found' };
			return { status: 'updated', id: result.id };
		}
	};
}
