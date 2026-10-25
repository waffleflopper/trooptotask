import { redirectToSensitiveActionStepUp } from '$features/identity';
import type { FeedbackStaffCommand, FeedbackStaffDetail, FeedbackStaffResult } from '$features/feedback/contracts';

export type FeedbackStaffRegion =
	| { status: 'loading' }
	| { status: 'ok'; detail: FeedbackStaffDetail }
	| { status: 'notFound' }
	| { status: 'error' };

type Accepted = Extract<FeedbackStaffResult, { status: 'replied' | 'noteSaved' | 'issueCreated' }>;
type Refused = Exclude<FeedbackStaffResult, Accepted>;

export type FeedbackCommandOutcome =
	| { type: 'accepted'; result: Accepted }
	| { type: 'refused'; result: Refused }
	| { type: 'failed'; message: string }
	/** The operator left the item, or the request was handed to step-up; nothing on screen changes. */
	| { type: 'ignored' };

export const COMMAND_FAILED =
	'The request did not complete, and it may have been saved. The thread above is reloaded; check it before trying again.';

const RESULT_STATUSES = [
	'replied',
	'noteSaved',
	'issueCreated',
	'notFound',
	'closed',
	'issueExists',
	'githubError',
	'issuePersistenceError'
];

function isResult(body: unknown): body is FeedbackStaffResult {
	return (
		typeof body === 'object' && body !== null && RESULT_STATUSES.includes((body as { status?: string }).status ?? '')
	);
}

/**
 * The staff side of one feedback item: its replies, private note and issue link load apart from the Inbox item, so a
 * failed read here shows its own error. Commands run one at a time and a result that arrives after `dispose` changes
 * nothing, so a response for an item the operator left never lands on the next one. Every settled command reads the
 * item again. After a failure the write may have committed, so `uncertain` holds further writes until a read lands
 * and shows whether it did.
 */
export function createFeedbackStaff(feedbackId: () => string) {
	let region = $state.raw<FeedbackStaffRegion>({ status: 'loading' });
	let reloadFailed = $state(false);
	let uncertain = $state(false);
	let pending = $state<FeedbackStaffCommand['kind'] | null>(null);
	let controller: AbortController | undefined;
	let run = 0;

	/** `keep` leaves the thread on screen while it reloads, because a draft or a result beside it still matters. */
	async function load(keep = false) {
		const id = feedbackId();
		controller?.abort();
		const mine = new AbortController();
		controller = mine;
		reloadFailed = false;
		if (!keep || region.status !== 'ok') region = { status: 'loading' };
		try {
			const response = await fetch(`/admin/api/feedback/${id}`, { signal: mine.signal });
			const body: unknown = await response.json().catch(() => null);
			if (mine.signal.aborted) return;
			if (response.status === 403 && redirectToSensitiveActionStepUp(body)) return;
			if (!response.ok) throw new Error('Feedback unavailable');
			const parsed = body as { status: 'ok'; detail: FeedbackStaffDetail } | { status: 'notFound' };
			uncertain = false;
			region = parsed.status === 'ok' ? { status: 'ok', detail: parsed.detail } : { status: 'notFound' };
		} catch {
			if (mine.signal.aborted) return;
			if (keep && region.status === 'ok') reloadFailed = true;
			else region = { status: 'error' };
		}
	}

	async function send(command: FeedbackStaffCommand): Promise<FeedbackCommandOutcome> {
		if (pending || uncertain) return { type: 'ignored' };
		const id = feedbackId();
		const mine = ++run;
		pending = command.kind;
		const outcome = await post(id, command, () => mine === run);
		if (mine !== run) return { type: 'ignored' };
		if (outcome.type === 'failed') uncertain = true;
		pending = null;
		if (outcome.type !== 'ignored') void load(true);
		return outcome;
	}

	async function post(
		id: string,
		command: FeedbackStaffCommand,
		current: () => boolean
	): Promise<FeedbackCommandOutcome> {
		try {
			const response = await fetch(`/admin/api/feedback/${id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(command)
			});
			const body: unknown = await response.json().catch(() => null);
			if (!current()) return { type: 'ignored' };
			if (response.status === 403 && redirectToSensitiveActionStepUp(body)) return { type: 'ignored' };
			if (isResult(body)) {
				return body.status === 'replied' || body.status === 'noteSaved' || body.status === 'issueCreated'
					? { type: 'accepted', result: body }
					: { type: 'refused', result: body };
			}
			const message = (body as { message?: unknown } | null)?.message;
			return { type: 'failed', message: typeof message === 'string' ? message : COMMAND_FAILED };
		} catch {
			return { type: 'failed', message: COMMAND_FAILED };
		}
	}

	return {
		load,
		send,
		get region() {
			return region;
		},
		get reloadFailed() {
			return reloadFailed;
		},
		get pending() {
			return pending;
		},
		get uncertain() {
			return uncertain;
		},
		dispose() {
			run++;
			controller?.abort();
		}
	};
}
