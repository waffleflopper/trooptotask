import type { SupabaseClient } from '$lib/server/database';
import type { PublishedWhatsNewEntry } from '../whatsNewTypes';

/** Platform owns the entries. The caller's own client reads them, so row security keeps drafts private. */
export async function listPublishedWhatsNew(client: SupabaseClient, limit: number): Promise<PublishedWhatsNewEntry[]> {
	const { data, error } = await client
		.from('whats_new_entries')
		.select('id, title, paragraphs, published_on')
		.not('published_seq', 'is', null)
		.order('published_seq', { ascending: false })
		.limit(limit);
	if (error) throw new Error('Failed to load What’s New entries', { cause: error });
	return (data ?? []).map((row) => ({
		id: row.id,
		title: row.title,
		paragraphs: row.paragraphs,
		publishedOn: row.published_on as string
	}));
}
