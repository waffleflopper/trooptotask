import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseReporterFeedbackReader } from './feedbackStaffProvider.server';

const ME = '10000000-0000-4000-8000-000000000001';

function provider(rows: unknown[], requests: URL[]) {
	return createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input) => {
				const url = new URL(new Request(input).url);
				requests.push(url);
				return Response.json(rows);
			}
		}
	});
}

describe('reporter feedback list', () => {
	it("reads only the signed-in account, newest first, with each thread's reply count", async () => {
		const requests: URL[] = [];
		const reader = createSupabaseReporterFeedbackReader(
			provider(
				[
					{
						id: 'b',
						category: 'feature',
						message: 'Add exports',
						status: 'reviewed',
						created_at: '2026-10-24T00:00:00Z',
						feedback_replies: [{ count: 2 }]
					},
					{
						id: 'a',
						category: 'bug',
						message: 'Calendar problem',
						status: 'new',
						created_at: '2026-10-23T00:00:00Z',
						feedback_replies: []
					}
				],
				requests
			)
		);

		const list = await reader.list(ME);

		expect(list.map(({ id, replyCount }) => [id, replyCount])).toEqual([
			['b', 2],
			['a', 0]
		]);
		const query = requests[0].searchParams;
		expect(query.get('user_id')).toBe(`eq.${ME}`);
		expect(query.get('order')).toBe('created_at.desc,id.desc');
		expect(query.get('limit')).toBe('50');
	});

	it('reports a failed read instead of an empty list', async () => {
		const reader = createSupabaseReporterFeedbackReader(
			createClient('http://127.0.0.1:9', 'synthetic-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: { fetch: async () => Response.json({ message: 'unavailable' }, { status: 500 }) }
			})
		);

		await expect(reader.list(ME)).rejects.toThrow('Unable to load feedback');
	});
});
