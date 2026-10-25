/** How many of the newest published entries the What's New dialog shows. */
export const WHATS_NEW_VISIBLE_COUNT = 3;

export const WHATS_NEW_LIMITS = { titleLength: 200, paragraphCount: 30, paragraphLength: 1500 } as const;

export interface WhatsNewEntry {
	id: string;
	title: string;
	paragraphs: string[];
	/** Date only, `null` while the entry is a draft. */
	publishedOn: string | null;
	/** Server-set. `null` for an entry imported before attribution existed. */
	updatedBy: string | null;
	updatedAt: string;
}

export interface PublishedWhatsNewEntry {
	id: string;
	title: string;
	paragraphs: string[];
	publishedOn: string;
}

export interface WhatsNewListEntry extends WhatsNewEntry {
	/** True for the newest published entries that users see in the dialog. */
	shownToUsers: boolean;
}

export interface WhatsNewSaveInput {
	/** `null` creates a new entry. */
	id: string | null;
	title: string;
	paragraphs: string[];
	/** The operator's calendar date. Present to publish a draft; ignored for an entry that is already published. */
	publishOn?: string;
}

export type WhatsNewValidation =
	| { valid: true; title: string; paragraphs: string[]; publishOn?: string }
	| { valid: false; error: string };

export type WhatsNewSaveResult =
	| { status: 'saved'; id: string; published: boolean }
	| { status: 'invalid'; error: string }
	| { status: 'not_found' };

export type WhatsNewDeleteResult = { status: 'deleted' } | { status: 'not_found' };
