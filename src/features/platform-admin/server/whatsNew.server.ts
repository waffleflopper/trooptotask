import type { AuditEvent } from '$lib/audit/contracts';
import {
	WHATS_NEW_LIMITS,
	WHATS_NEW_VISIBLE_COUNT,
	type WhatsNewDeleteResult,
	type WhatsNewEntry,
	type WhatsNewListEntry,
	type WhatsNewSaveInput,
	type WhatsNewSaveResult,
	type WhatsNewValidation
} from '../whatsNewTypes';

export interface WhatsNewStoreWrite {
	title: string;
	paragraphs: string[];
	publishedOn: string | null;
	updatedBy: string;
}

export interface WhatsNewStore {
	/** Drafts first, then published entries newest first. */
	listEntries(): Promise<WhatsNewEntry[]>;
	getEntry(id: string): Promise<WhatsNewEntry | null>;
	createEntry(input: WhatsNewStoreWrite): Promise<WhatsNewEntry>;
	/** Leaves `published_on` as it is unless `publishedOn` is given. */
	updateEntry(input: {
		id: string;
		title: string;
		paragraphs: string[];
		publishedOn?: string;
		updatedBy: string;
	}): Promise<boolean>;
	deleteDraft(id: string): Promise<void>;
}

export interface WhatsNewDependencies {
	store: WhatsNewStore;
	actorUserId: string;
	audit(event: AuditEvent): Promise<void>;
	now?: () => Date;
}

export interface PlatformWhatsNew {
	list(): Promise<WhatsNewListEntry[]>;
	save(input: WhatsNewSaveInput): Promise<WhatsNewSaveResult>;
	deleteDraft(id: string): Promise<WhatsNewDeleteResult>;
}

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function markShownToUsers(entries: WhatsNewEntry[]): WhatsNewListEntry[] {
	const shown = new Set(
		entries
			.filter((entry) => entry.publishedOn !== null)
			.slice(0, WHATS_NEW_VISIBLE_COUNT)
			.map((entry) => entry.id)
	);
	return entries.map((entry) => ({ ...entry, shownToUsers: shown.has(entry.id) }));
}

/** The client names the operator's own calendar day. It must sit within a day of the server's date, so a time zone cannot date an entry in the future. */
export function validateWhatsNewDraft(
	input: { title: string; paragraphs: string[]; publishOn?: string },
	now: Date = new Date()
): WhatsNewValidation {
	const title = input.title.trim();
	const paragraphs = input.paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
	if (!title) return { valid: false, error: 'Title is required' };
	if (title.length > WHATS_NEW_LIMITS.titleLength)
		return { valid: false, error: `Title must be ${WHATS_NEW_LIMITS.titleLength} characters or less` };
	if (paragraphs.length > WHATS_NEW_LIMITS.paragraphCount)
		return { valid: false, error: `Use ${WHATS_NEW_LIMITS.paragraphCount} paragraphs or fewer` };
	if (paragraphs.some((paragraph) => paragraph.length > WHATS_NEW_LIMITS.paragraphLength))
		return { valid: false, error: `Each paragraph must be ${WHATS_NEW_LIMITS.paragraphLength} characters or less` };
	if (input.publishOn === undefined) return { valid: true, title, paragraphs };
	if (paragraphs.length === 0) return { valid: false, error: 'Add a paragraph before publishing' };
	const date = ISO_DATE.test(input.publishOn) ? Date.parse(`${input.publishOn}T00:00:00Z`) : NaN;
	const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
	if (
		Number.isNaN(date) ||
		new Date(date).toISOString().slice(0, 10) !== input.publishOn ||
		Math.abs(date - today) > DAY_MS
	)
		return { valid: false, error: 'Publish date must be today' };
	return { valid: true, title, paragraphs, publishOn: input.publishOn };
}

export function createPlatformWhatsNew(deps: WhatsNewDependencies): PlatformWhatsNew {
	return {
		async list() {
			return markShownToUsers(await deps.store.listEntries());
		},

		async save(input) {
			const validation = validateWhatsNewDraft(input, deps.now?.());
			if (!validation.valid) return { status: 'invalid', error: validation.error };
			const { title, paragraphs, publishOn } = validation;

			if (input.id === null) {
				const entry = await deps.store.createEntry({
					title,
					paragraphs,
					publishedOn: publishOn ?? null,
					updatedBy: deps.actorUserId
				});
				await deps.audit({
					action: publishOn ? 'whats_new_publish' : 'whats_new_create',
					resourceType: 'whats_new_entry',
					resourceId: entry.id,
					details: { title },
					severity: 'info'
				});
				return { status: 'saved', id: entry.id, published: publishOn !== undefined };
			}

			const existing = await deps.store.getEntry(input.id);
			if (!existing) return { status: 'not_found' };
			if (existing.publishedOn !== null && paragraphs.length === 0)
				return { status: 'invalid', error: 'A published entry needs a paragraph' };
			const publishing = existing.publishedOn === null && publishOn !== undefined;
			const updated = await deps.store.updateEntry({
				id: input.id,
				title,
				paragraphs,
				publishedOn: publishing ? publishOn : undefined,
				updatedBy: deps.actorUserId
			});
			if (!updated) return { status: 'not_found' };
			await deps.audit({
				action: publishing ? 'whats_new_publish' : 'whats_new_update',
				resourceType: 'whats_new_entry',
				resourceId: input.id,
				details: { title },
				severity: 'info'
			});
			return { status: 'saved', id: input.id, published: publishing || existing.publishedOn !== null };
		},

		async deleteDraft(id) {
			const existing = await deps.store.getEntry(id);
			if (!existing) return { status: 'not_found' };
			if (existing.publishedOn !== null) return { status: 'published' };
			await deps.store.deleteDraft(id);
			await deps.audit({
				action: 'whats_new_delete',
				resourceType: 'whats_new_entry',
				resourceId: id,
				details: { title: existing.title },
				severity: 'warning'
			});
			return { status: 'deleted' };
		}
	};
}
