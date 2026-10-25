import type { Component } from 'svelte';
import type { InboxKind } from '../../inboxTypes';
import AccessRequestDetail from './AccessRequestDetail.svelte';
import type { InboxDetailProps } from './inboxDetailProps';
import FeedbackDetail from './FeedbackDetail.svelte';

export interface InboxKindView<K extends InboxKind> {
	label: string;
	filterLabel: string;
	/** Marks a kind that goes away with the closed beta. */
	badge?: string;
	Detail: Component<InboxDetailProps<K>>;
}

/** Adding an Inbox kind adds one entry here, one in `InboxSources` and its detail component. */
export const INBOX_KIND_VIEWS: { [K in InboxKind]: InboxKindView<K> } = {
	accessRequest: {
		label: 'Access request',
		filterLabel: 'Access requests',
		badge: 'Closed beta',
		Detail: AccessRequestDetail
	},
	feedback: { label: 'Feedback', filterLabel: 'Feedback', Detail: FeedbackDetail }
};

/** The registry is keyed per kind; a loaded detail carries its own kind, so dispatch widens once, here. */
export function detailComponentFor(kind: InboxKind) {
	return INBOX_KIND_VIEWS[kind].Detail as Component<InboxDetailProps<InboxKind>>;
}
