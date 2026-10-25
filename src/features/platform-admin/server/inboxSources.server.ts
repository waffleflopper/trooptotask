import type { SupabaseClient } from '@supabase/supabase-js';
import { getAccessRequestHeardAboutLabel } from '$features/identity/contracts';
import {
	createIdentityAccessRequestInboxReader,
	type AccessRequestInboxRow,
	type IdentityAccessRequestInboxReader
} from '$features/identity/index.server';
import {
	createSupabaseFeedbackInboxReader,
	type FeedbackInboxReader,
	type FeedbackInboxRow
} from '$features/feedback/index.server';
import {
	INBOX_DONE_DAYS,
	INBOX_PAGE_LIMIT,
	type InboxDetailOf,
	type InboxItemOf,
	type InboxKind,
	type InboxSourceResult,
	type InboxTab
} from '../inboxTypes';

/** What the Inbox needs from one item kind. Adding a kind adds one entry to `InboxSources`. */
export interface InboxSource<K extends InboxKind> {
	read(tab: InboxTab): Promise<{ count: number; items: InboxItemOf<K>[] }>;
	detail(id: string): Promise<InboxDetailOf<K> | null>;
}

export type InboxSources = { [K in InboxKind]: InboxSource<K> };

const MAX_UNIT_LENGTH = 80;
const MESSAGE_TITLE_LENGTH = 90;

function doneSince(now: Date): Date {
	return new Date(now.getTime() - INBOX_DONE_DAYS * 86_400_000);
}

function accessRequestItem(row: AccessRequestInboxRow): InboxItemOf<'accessRequest'> {
	const closed = row.status === 'approved' || row.status === 'rejected';
	return {
		kind: 'accessRequest',
		id: row.id,
		title: row.name,
		summary: row.email,
		receivedAt: row.created_at,
		closedAt: closed ? row.reviewed_at : null,
		outcome: row.status === 'approved' || row.status === 'rejected' ? row.status : null
	};
}

function feedbackTitle(message: string): string {
	const line = message.trim().split(/\r?\n/, 1)[0] ?? '';
	return line.length > MESSAGE_TITLE_LENGTH ? `${line.slice(0, MESSAGE_TITLE_LENGTH).trimEnd()}…` : line;
}

function feedbackItem(row: FeedbackInboxRow): InboxItemOf<'feedback'> {
	return {
		kind: 'feedback',
		id: row.id,
		title: feedbackTitle(row.message),
		summary: row.user_email,
		receivedAt: row.created_at,
		closedAt: row.status === 'resolved' ? row.updated_at : null,
		category: row.category
	};
}

function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function findSimilarOrganizations(client: SupabaseClient, unit: string | null): Promise<string[]> {
	const term = unit?.trim();
	if (!term || term.length > MAX_UNIT_LENGTH) return [];
	const { data, error } = await client
		.from('organizations')
		.select('name')
		.ilike('name', `%${escapeLikePattern(term)}%`)
		.order('name')
		.limit(3);
	if (error || !Array.isArray(data)) throw new Error('Unable to read Organizations');
	return data.map((row: { name: string }) => row.name);
}

export function createAccessRequestInboxSource(
	reader: IdentityAccessRequestInboxReader,
	client: SupabaseClient,
	now: () => Date = () => new Date()
): InboxSource<'accessRequest'> {
	return {
		async read(tab) {
			const page =
				tab === 'open'
					? await reader.readOpen({ limit: INBOX_PAGE_LIMIT })
					: await reader.readClosed({ since: doneSince(now()), limit: INBOX_PAGE_LIMIT });
			return { count: page.count, items: page.rows.map(accessRequestItem) };
		},
		async detail(id) {
			const row = await reader.get(id);
			if (!row) return null;
			const [accountExists, similarOrganizations] = await Promise.all([
				reader.accountExists(row.email),
				findSimilarOrganizations(client, row.reason)
			]);
			return {
				kind: 'accessRequest',
				id: row.id,
				name: row.name,
				email: row.email,
				reason: row.reason,
				heardAbout: heardAboutText(row),
				receivedAt: row.created_at,
				status: row.status,
				reviewedAt: row.reviewed_at,
				accountExists,
				similarOrganizations
			};
		}
	};
}

function heardAboutText(row: AccessRequestInboxRow): string | null {
	const label = getAccessRequestHeardAboutLabel(row.heard_about);
	if (!label) return null;
	return row.heard_about_details ? `${label} (${row.heard_about_details})` : label;
}

export function createFeedbackInboxSource(
	reader: FeedbackInboxReader,
	now: () => Date = () => new Date()
): InboxSource<'feedback'> {
	return {
		async read(tab) {
			const page =
				tab === 'open'
					? await reader.readOpen({ limit: INBOX_PAGE_LIMIT })
					: await reader.readClosed({ since: doneSince(now()), limit: INBOX_PAGE_LIMIT });
			return { count: page.count, items: page.rows.map(feedbackItem) };
		},
		async detail(id) {
			const row = await reader.get(id);
			if (!row) return null;
			return {
				kind: 'feedback',
				id: row.id,
				category: row.category,
				message: row.message,
				pageUrl: row.page_url,
				pageSection: row.page_section,
				person: row.user_email,
				organizationName: row.organization_name,
				status: row.status,
				receivedAt: row.created_at,
				closedAt: row.status === 'resolved' ? row.updated_at : null
			};
		}
	};
}

export function createInboxSources(client: SupabaseClient): InboxSources {
	return {
		accessRequest: createAccessRequestInboxSource(createIdentityAccessRequestInboxReader(client), client),
		feedback: createFeedbackInboxSource(createSupabaseFeedbackInboxReader(client))
	};
}

/** One source read; a failure is that source's own error and never an empty list. */
export async function readInboxSource<K extends InboxKind>(
	source: InboxSource<K>,
	tab: InboxTab
): Promise<InboxSourceResult<K>> {
	try {
		const { count, items } = await source.read(tab);
		return { status: 'ok', count, items };
	} catch (cause) {
		console.error('[platform-admin-inbox] source read failed', cause);
		return { status: 'error' };
	}
}

/** The result type is exhaustive over `InboxKind`, so a new kind fails to compile until it is read here. */
export function readInboxSources(
	sources: InboxSources,
	tab: InboxTab
): { [K in InboxKind]: Promise<InboxSourceResult<K>> } {
	return {
		accessRequest: readInboxSource(sources.accessRequest, tab),
		feedback: readInboxSource(sources.feedback, tab)
	};
}
