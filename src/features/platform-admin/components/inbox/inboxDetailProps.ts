import type { InboxDetailOf, InboxKind } from '../../inboxTypes';

export interface InboxDetailProps<K extends InboxKind> {
	detail: InboxDetailOf<K>;
	/** Asks the Inbox to re-read the queue and this item after a command settled. */
	onChanged: () => void;
}
