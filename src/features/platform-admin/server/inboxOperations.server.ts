import type { RequestEvent } from '@sveltejs/kit';
import { auditLog } from '$lib/audit/index.server';
import { admitPlatformAdministrator } from './admission.server';
import { createInboxSources, readInboxSources } from './inboxSources.server';
import { createSupabaseFeedbackInboxReader } from '$features/feedback/index.server';
import type { InboxDetail, InboxItemRef, InboxStatsResult, InboxTab } from '../inboxTypes';

function startOfMonth(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Reads and commands behind the Inbox, bound to the admitted operator. */
export async function createPlatformInboxOperations(event: RequestEvent) {
	const { adminClient, requestInfo } = await admitPlatformAdministrator(event);
	const sources = createInboxSources(adminClient);
	const feedback = createSupabaseFeedbackInboxReader(adminClient);

	return {
		/** Each source settles on its own, so a failed one is that kind's error and the rest still render. */
		queue: (tab: InboxTab) => readInboxSources(sources, tab),

		async stats(now = new Date()): Promise<InboxStatsResult> {
			try {
				const { data, error } = await adminClient.rpc('platform_inbox_stats', {
					p_since: startOfMonth(now).toISOString()
				});
				if (error || typeof data?.newPeople !== 'number' || typeof data?.newOrganizations !== 'number')
					throw new Error('Inbox stats were unavailable');
				return { status: 'ok', newPeople: data.newPeople, newOrganizations: data.newOrganizations };
			} catch (cause) {
				console.error('[platform-admin-inbox] stats read failed', cause);
				return { status: 'error' };
			}
		},

		async detail(ref: InboxItemRef): Promise<InboxDetail | null> {
			return sources[ref.kind].detail(ref.id);
		},

		async closeFeedback(feedbackId: string): Promise<'closed' | 'not_open'> {
			if (!(await feedback.close(feedbackId))) return 'not_open';
			await auditLog(
				{
					action: 'feedback.closed_without_reply',
					resourceType: 'feedback',
					resourceId: feedbackId
				},
				requestInfo,
				{ required: true }
			);
			return 'closed';
		}
	};
}
