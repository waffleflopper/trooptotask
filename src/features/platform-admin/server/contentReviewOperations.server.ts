import type { RequestEvent } from '@sveltejs/kit';
import { createFeedbackReview, createSupabaseFeedbackReviewStore } from '$features/feedback/index.server';
import { admitPlatformAdministrator } from './admission.server';

export async function createPlatformFeedbackOperations(event: RequestEvent) {
	const { adminClient } = await admitPlatformAdministrator(event);
	return createFeedbackReview(createSupabaseFeedbackReviewStore(adminClient));
}
