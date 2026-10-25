import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseFeedbackInboxReader } from './feedbackInbox.server';

const stored = (id: string, userId: string) => ({
	id,
	user_id: userId,
	user_email: `${userId}@example.test`,
	category: 'bug',
	message: 'It will not save',
	page_url: null,
	page_section: 'Calendar',
	organization_name: 'HHC, 1-8 CAV',
	status: 'new',
	created_at: '2026-10-20T08:00:00Z',
	updated_at: '2026-10-20T08:00:00Z'
});

function readerWith(profiles: { data: unknown; error: unknown }) {
	const rows = [stored('f1', 'u1'), stored('f2', 'u2'), stored('f3', 'u1')];
	const profileIds = vi.fn();
	const client = {
		from(table: string) {
			if (table === 'user_profiles') {
				return {
					select: () => ({
						in: async (_column: string, ids: string[]) => {
							profileIds(ids);
							return profiles;
						}
					})
				};
			}
			const page = { data: rows, error: null, count: rows.length };
			const query = { in: () => query, order: () => query, limit: async () => page };
			return { select: () => query };
		}
	} as unknown as SupabaseClient;
	return { reader: createSupabaseFeedbackInboxReader(client), profileIds };
}

describe('feedback inbox submitter names', () => {
	it('names each submitter from one profile read for the whole page', async () => {
		const { reader, profileIds } = readerWith({
			data: [
				{ user_id: 'u1', first_name: 'Adaeze', last_name: 'Oduya' },
				{ user_id: 'u2', first_name: null, last_name: null }
			],
			error: null
		});

		const page = await reader.readOpen({ limit: 50 });

		expect(page.rows.map((row) => row.submitter_name)).toEqual(['Adaeze Oduya', null, 'Adaeze Oduya']);
		expect(profileIds).toHaveBeenCalledTimes(1);
		expect(profileIds).toHaveBeenCalledWith(['u1', 'u2']);
	});

	it('still lists the feedback, unnamed, when the names cannot be read', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { reader } = readerWith({ data: null, error: new Error('profiles down') });

		const page = await reader.readOpen({ limit: 50 });

		expect(page.rows).toHaveLength(3);
		expect(page.rows.every((row) => row.submitter_name === null)).toBe(true);
	});
});
