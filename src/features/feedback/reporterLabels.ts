import type { BadgeVariant } from '$lib/components/ui/badge';
import type { FeedbackCategory, FeedbackStatus } from './contracts';

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
	bug: 'Bug report',
	feature: 'Feature request',
	general: 'General feedback'
};

/** How the reporter reads each step of the thread: waiting on TroopToTask, answered, or closed. */
export const REPORTER_FEEDBACK_STATUS: Record<FeedbackStatus, { label: string; variant: BadgeVariant }> = {
	new: { label: 'Received', variant: 'secondary' },
	reviewed: { label: 'Replied', variant: 'info' },
	resolved: { label: 'Closed', variant: 'success' }
};
