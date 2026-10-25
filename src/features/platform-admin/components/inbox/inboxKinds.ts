import type { Component } from 'svelte';
import type { InboxItem, InboxItemOf, InboxKind } from '../../inboxTypes';
import { formatAdminLabel } from '../adminTheme';
import AccessRequestDetail from './AccessRequestDetail.svelte';
import type { InboxDetailProps } from './inboxDetailProps';
import FeedbackDetail from './FeedbackDetail.svelte';
import type { InboxTone } from './inboxTones';

export interface InboxKindView<K extends InboxKind> {
	label: string;
	filterLabel: string;
	tone: InboxTone;
	/** Marks a kind that goes away with the closed beta. */
	badge?: string;
	/** The short line over a queue row: the kind and the one fact that sorts it. */
	eyebrow: (item: InboxItemOf<K>) => string;
	Detail: Component<InboxDetailProps<K>>;
}

/** Adding an Inbox kind adds one entry here, one in `InboxSources` and its detail component. */
export const INBOX_KIND_VIEWS: { [K in InboxKind]: InboxKindView<K> } = {
	accessRequest: {
		label: 'Access request',
		filterLabel: 'Access',
		tone: 'accent',
		badge: 'Closed beta',
		eyebrow: (item) => `Access request · ${item.outcome ? formatAdminLabel(item.outcome) : 'Closed beta'}`,
		Detail: AccessRequestDetail
	},
	feedback: {
		label: 'Feedback',
		filterLabel: 'Feedback',
		tone: 'info',
		eyebrow: (item) => `Feedback · ${formatAdminLabel(item.category)}${item.closedAt ? ' · Closed' : ''}`,
		Detail: FeedbackDetail
	}
};

/** The registry is keyed per kind; an item or detail carries its own kind, so dispatch widens once, here. */
export function detailComponentFor(kind: InboxKind) {
	return INBOX_KIND_VIEWS[kind].Detail as Component<InboxDetailProps<InboxKind>>;
}

export function eyebrowFor(item: InboxItem): string {
	return (INBOX_KIND_VIEWS[item.kind].eyebrow as (item: InboxItem) => string)(item);
}
