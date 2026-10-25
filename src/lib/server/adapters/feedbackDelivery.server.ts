import type { RequestEvent } from '@sveltejs/kit';
import { admitPlatformAdministrator } from '$features/platform-admin/index.server';
import { auditLog } from '$lib/audit/index.server';
import {
	createFeedbackStaffCommands,
	createSupabaseFeedbackStaffStore,
	createGitHubFeedbackClient,
	createSupabaseReporterFeedbackReader
} from '$features/feedback/index.server';

export async function createRequestFeedbackStaffOperations(event: RequestEvent) {
	const { requestInfo } = await admitPlatformAdministrator(event);
	const store = createSupabaseFeedbackStaffStore(event.locals.supabase);
	const commands = createFeedbackStaffCommands({
		store,
		github: createGitHubFeedbackClient(),
		audit: (entry, options) => auditLog(entry, requestInfo, options)
	});
	return { detail: store.detail, execute: commands.execute };
}

/** The reporter reads through the ordinary request client, so RLS keeps another account's feedback concealed. */
export function createRequestReporterFeedback(locals: Pick<App.Locals, 'supabase'>, userId: string) {
	const reader = createSupabaseReporterFeedbackReader(locals.supabase);
	return { detail: reader.detail, list: () => reader.list(userId) };
}
