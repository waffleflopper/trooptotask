import type { RequestEvent } from '@sveltejs/kit';
import { createSupabasePlatformAudit } from '$lib/audit/index.server';
import { createFeedbackReview, createSupabaseFeedbackReviewStore } from '$features/feedback/index.server';
import { admitPlatformAdministrator } from './admission.server';
import { PLATFORM_ADMIN_PAGE_ROLES } from './navigation.server';

export async function createPlatformFeedbackOperations(event: RequestEvent) {
	const { adminClient } = await admitPlatformAdministrator(event, PLATFORM_ADMIN_PAGE_ROLES.feedback);
	return createFeedbackReview(createSupabaseFeedbackReviewStore(adminClient));
}

export async function createPlatformAuditOperations(event: RequestEvent) {
	const { adminClient } = await admitPlatformAdministrator(event, PLATFORM_ADMIN_PAGE_ROLES.audit);
	const audit = createSupabasePlatformAudit(adminClient);
	return { listLogs: audit.listLogs };
}
