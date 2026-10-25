import type { RequestEvent } from '@sveltejs/kit';
import { admitPlatformAdministrator } from '$features/platform-admin/index.server';
import { auditLog } from '$lib/audit/index.server';
import { createSupabaseNotificationDelivery } from '$features/notifications/index.server';
import {
	createFeedbackStaffCommands,
	createSupabaseFeedbackStaffStore,
	createGitHubFeedbackClient,
	reporterFeedbackHref
} from '$features/feedback/index.server';

export async function createRequestFeedbackStaffOperations(event: RequestEvent) {
	const { adminClient, requestInfo } = await admitPlatformAdministrator(event);
	const store = createSupabaseFeedbackStaffStore(event.locals.supabase);
	const notifications = createSupabaseNotificationDelivery({
		getAdminClient: () => adminClient,
		resolveAdministratorRecipients: async () => ({ userIds: [], errorMessage: null }),
		failureMode: 'required'
	});
	const commands = createFeedbackStaffCommands({
		store,
		github: createGitHubFeedbackClient(),
		notifyReporter: ({ userId, feedbackId }) =>
			notifications.notifyUser(null, userId, {
				type: 'feedback_reply',
				title: 'A reply to your feedback',
				message: 'The TroopToTask operator replied to your feedback.',
				link: reporterFeedbackHref(feedbackId)
			}),
		audit: (entry, options) => auditLog(entry, requestInfo, options)
	});
	return { detail: store.detail, execute: commands.execute };
}
