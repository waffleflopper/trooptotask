import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { WhatsNewEntry } from '../whatsNewTypes';
import type { WhatsNewStore } from './whatsNew.server';

interface WhatsNewRow {
	id: string;
	title: string;
	paragraphs: string[];
	published_on: string | null;
	updated_by: string | null;
	updated_at: string;
}

const COLUMNS = 'id, title, paragraphs, published_on, updated_by, updated_at';

function mapEntry(row: WhatsNewRow): WhatsNewEntry {
	return {
		id: row.id,
		title: row.title,
		paragraphs: row.paragraphs,
		publishedOn: row.published_on,
		updatedBy: row.updated_by,
		updatedAt: row.updated_at
	};
}

function failure(operation: string, error: unknown): Error {
	return new Error(`table whats_new_entries ${operation} failed`, { cause: error });
}

export function createSupabaseWhatsNewStore(supabase: SupabaseClient): WhatsNewStore {
	return {
		async listEntries() {
			const result = await selectAllSupabaseRows<WhatsNewRow>(async (from, to) => {
				const { data, error } = await supabase
					.from('whats_new_entries')
					.select(COLUMNS)
					.order('published_seq', { ascending: false, nullsFirst: true })
					.order('updated_at', { ascending: false })
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (result.error) throw failure('list', result.error);
			return (result.data ?? []).map(mapEntry);
		},

		async getEntry(id) {
			const { data, error } = await supabase.from('whats_new_entries').select(COLUMNS).eq('id', id).maybeSingle();
			if (error) throw failure('read', error);
			return data ? mapEntry(data as WhatsNewRow) : null;
		},

		async createEntry(input) {
			const { data, error } = await supabase
				.from('whats_new_entries')
				.insert({
					title: input.title,
					paragraphs: input.paragraphs,
					published_on: input.publishedOn,
					updated_by: input.updatedBy
				})
				.select(COLUMNS)
				.single();
			if (error || !data) throw failure('insert', error ?? 'missing row');
			return mapEntry(data as WhatsNewRow);
		},

		async updateEntry(input) {
			const { data, error } = await supabase
				.from('whats_new_entries')
				.update({
					title: input.title,
					paragraphs: input.paragraphs,
					updated_by: input.updatedBy,
					...(input.publishedOn === undefined ? {} : { published_on: input.publishedOn })
				})
				.eq('id', input.id)
				.select('id')
				.maybeSingle();
			if (error) throw failure('update', error);
			return data !== null;
		},

		async deleteEntry(id) {
			const { error } = await supabase.from('whats_new_entries').delete().eq('id', id);
			if (error) throw failure('delete', error);
		}
	};
}
