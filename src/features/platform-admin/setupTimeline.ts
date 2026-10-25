import type { PersonAccessHistory, SetupEmailTimeline } from '$features/identity/contracts';

export type TimelineTone = 'done' | 'pending' | 'failed';

export interface TimelineEntry {
	id: string;
	at: string;
	text: string;
	detail?: string;
	tone: TimelineTone;
}

const DAY = 86_400_000;

const REVOCATION_TEXT: Record<string, string> = {
	manual: 'You withdrew the setup link.',
	replaced: 'A newer setup link replaced it.',
	cleanup: 'The expired link was retired.'
};

function expiresIn(iso: string, now: Date): string {
	const days = Math.floor((new Date(iso).getTime() - now.getTime()) / DAY);
	if (days < 1) return 'within a day';
	return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * The setup email's story as sentences, oldest first. Links arrive newest first; only the newest can still be waiting.
 */
export function setupTimelineEntries(timeline: SetupEmailTimeline, now: Date, email?: string): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	const add = (entry: TimelineEntry) => entries.push(entry);
	const links = [...timeline].reverse();
	links.forEach((link, index) => {
		const newest = index === links.length - 1;
		const sent = link.deliveries.filter((delivery) => delivery.status === 'sent' && delivery.sent_at);
		for (const delivery of sent)
			add({
				id: `${delivery.id}:sent`,
				at: delivery.sent_at!,
				text: 'Setup link sent.',
				detail: email ? `Delivered to ${email}` : undefined,
				tone: 'done'
			});
		for (const delivery of link.deliveries.filter((d) => d.status === 'failed'))
			add({
				id: `${delivery.id}:failed`,
				at: delivery.updated_at,
				text: 'The setup email could not be sent.',
				detail: delivery.last_error ?? undefined,
				tone: 'failed'
			});
		if (link.deliveries.length === 0)
			add({ id: `${link.id}:created`, at: link.created_at, text: 'Setup link created.', tone: 'done' });
		if (link.bounced_at)
			add({
				id: `${link.id}:bounced`,
				at: link.bounced_at,
				text: 'Delivery failed.',
				detail: link.bounce_reason ? `The mail server said: ${link.bounce_reason}` : undefined,
				tone: 'failed'
			});
		if (link.claimed_at)
			add({ id: `${link.id}:claimed`, at: link.claimed_at, text: 'Started setting up the account.', tone: 'done' });
		if (link.used_at)
			add({ id: `${link.id}:used`, at: link.used_at, text: 'Finished setting up the account.', tone: 'done' });
		if (link.failed_at)
			add({
				id: `${link.id}:setup-failed`,
				at: link.failed_at,
				text: 'Account setup did not finish.',
				detail: link.failure_reason ?? undefined,
				tone: 'failed'
			});
		if (link.revoked_at)
			add({
				id: `${link.id}:revoked`,
				at: link.revoked_at,
				text: REVOCATION_TEXT[link.revocation_reason ?? ''] ?? 'The setup link was withdrawn.',
				tone: 'done'
			});
		const expired = new Date(link.expires_at).getTime() <= now.getTime();
		const lapsedUnused =
			!link.claimed_at && expired && (!link.revoked_at || Date.parse(link.revoked_at) >= Date.parse(link.expires_at));
		if (lapsedUnused)
			add({ id: `${link.id}:expired`, at: link.expires_at, text: 'The link expired unused.', tone: 'failed' });
		else if (newest && !expired && !link.claimed_at && !link.revoked_at && !link.used_at) {
			add({
				id: `${link.id}:waiting`,
				at: link.expires_at,
				text: 'Has not finished setup.',
				detail: `The link expires ${expiresIn(link.expires_at, now)}. Resending replaces it.`,
				tone: 'pending'
			});
		}
	});
	return sortByTime(entries);
}

export function sortByTime(entries: TimelineEntry[]): TimelineEntry[] {
	return entries
		.map((entry, order) => ({ entry, order }))
		.sort((a, b) => Date.parse(a.entry.at) - Date.parse(b.entry.at) || a.order - b.order)
		.map(({ entry }) => entry);
}

/** How a person got in: each access request for their email, as short sentences. */
export function accessHistoryEntries(history: PersonAccessHistory[]): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	for (const request of history) {
		entries.push({
			id: `${request.id}:requested`,
			at: request.created_at,
			text: 'Access was requested.',
			tone: 'done'
		});
		if (request.reviewed_at && request.status !== 'pending')
			entries.push({
				id: `${request.id}:reviewed`,
				at: request.reviewed_at,
				text: request.status === 'rejected' ? 'The access request was rejected.' : 'The access request was approved.',
				tone: 'done'
			});
		if (request.setup_completed_at)
			entries.push({
				id: `${request.id}:setup`,
				at: request.setup_completed_at,
				text: 'Set up the account.',
				tone: 'done'
			});
		if (request.rescinded_at)
			entries.push({
				id: `${request.id}:rescinded`,
				at: request.rescinded_at,
				text: 'Access was rescinded.',
				tone: 'done'
			});
	}
	return sortByTime(entries);
}

/** The request's own steps for a person who has not finished setup, ahead of the setup email's story. */
export function requestEntries(request: {
	id: string;
	created_at: string;
	reviewed_at: string | null;
}): TimelineEntry[] {
	return [
		{
			id: `${request.id}:requested`,
			at: request.created_at,
			text: 'Access was requested.',
			tone: 'done'
		},
		...(request.reviewed_at
			? [
					{
						id: `${request.id}:approved`,
						at: request.reviewed_at,
						text: 'The access request was approved.',
						tone: 'done' as const
					}
				]
			: [])
	];
}
