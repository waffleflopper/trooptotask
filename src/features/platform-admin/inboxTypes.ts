import type { FeedbackCategory, FeedbackStatus } from '$features/feedback/contracts';

/** Every kind of Inbox item. A new kind adds one entry here and one entry in each registry. */
export const INBOX_KINDS = ['accessRequest', 'feedback'] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

export type InboxTab = 'open' | 'done';

interface InboxItemBase {
	id: string;
	title: string;
	summary: string;
	receivedAt: string;
	/** Null while the item is open. */
	closedAt: string | null;
}

export type InboxItem =
	| (InboxItemBase & { kind: 'accessRequest'; outcome: 'approved' | 'rejected' | null })
	| (InboxItemBase & { kind: 'feedback'; category: FeedbackCategory });

export type InboxItemOf<K extends InboxKind> = Extract<InboxItem, { kind: K }>;

export type InboxDetail =
	| {
			kind: 'accessRequest';
			id: string;
			name: string;
			email: string;
			/** What the person wrote, which is where a unit gets named. */
			reason: string | null;
			heardAbout: string | null;
			receivedAt: string;
			status: 'pending' | 'approved' | 'rejected' | 'rescinded';
			reviewedAt: string | null;
			accountExists: boolean;
			similarOrganizations: string[];
	  }
	| {
			kind: 'feedback';
			id: string;
			category: FeedbackCategory;
			message: string;
			pageUrl: string | null;
			pageSection: string | null;
			person: string;
			organizationName: string | null;
			status: FeedbackStatus;
			receivedAt: string;
			closedAt: string | null;
	  };

export type InboxDetailOf<K extends InboxKind> = Extract<InboxDetail, { kind: K }>;

export type InboxSourceResult<K extends InboxKind = InboxKind> =
	| { status: 'ok'; count: number; items: InboxItemOf<K>[] }
	| { status: 'error' };

export type InboxStatsResult = { status: 'ok'; newPeople: number; newOrganizations: number } | { status: 'error' };

export type InboxDetailResponse = { status: 'ok'; detail: InboxDetail } | { status: 'notFound' };

export const INBOX_PAGE_LIMIT = 50;
export const INBOX_DONE_DAYS = 30;

export function isInboxKind(value: unknown): value is InboxKind {
	return typeof value === 'string' && (INBOX_KINDS as readonly string[]).includes(value);
}

export interface InboxItemRef {
	kind: InboxKind;
	id: string;
}

export function inboxItemKey(ref: InboxItemRef): string {
	return `${ref.kind}:${ref.id}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseInboxItemKey(value: string | null): InboxItemRef | null {
	if (!value) return null;
	const separator = value.indexOf(':');
	const kind = value.slice(0, separator);
	const id = value.slice(separator + 1);
	return isInboxKind(kind) && UUID.test(id) ? { kind, id } : null;
}

export function parseInboxTab(value: string | null): InboxTab {
	return value === 'done' ? 'done' : 'open';
}

export type InboxFilter = 'all' | InboxKind;

export function parseInboxFilter(value: string | null): InboxFilter {
	return isInboxKind(value) ? value : 'all';
}

export function inboxHref(state: { tab: InboxTab; filter: InboxFilter; item: InboxItemRef | null }): string {
	const params = new URLSearchParams();
	if (state.tab === 'done') params.set('tab', 'done');
	if (state.filter !== 'all') params.set('kind', state.filter);
	if (state.item) params.set('item', inboxItemKey(state.item));
	const query = params.toString();
	return query ? `/admin?${query}` : '/admin';
}
