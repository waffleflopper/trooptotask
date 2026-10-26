import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseCalendarTaskingPersistence } from './taskingPersistence.server';
import { describeActivity } from './components/taskingLabels';

describe('Tasking Activity read', () => {
	it('keeps database-redacted staffing counts and the existing Activity display', async () => {
		const client = createClient('http://activity.invalid', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					if (url.pathname !== '/rest/v1/rpc/read_calendar_tasking_activity' || request.method !== 'POST')
						throw new Error('Activity is available only through the protected read');
					const args = await request.json();
					if (args.p_organization_id !== 'org-a' || args.p_tasking_id !== 'tasking-a')
						throw new Error('Activity read used the wrong Organization or Tasking');
					return Response.json([
						{
							id: 17,
							occurred_at: '2030-10-19T12:00:00Z',
							actor_id: 'operator-a',
							kind: 'staffing_changed',
							payload: {
								added: { names: [], others: 1 },
								removed: { names: ['SGT Baker, Ben'], others: 0 },
								kept: { names: [], others: 0 }
							}
						}
					]);
				}
			}
		});
		const entries = await createSupabaseCalendarTaskingPersistence(client, 'org-a').listActivity('tasking-a');
		expect(entries).toEqual([
			{
				id: 17,
				at: '2030-10-19T12:00:00Z',
				actorUserId: 'operator-a',
				kind: 'staffing_changed',
				added: { names: [], others: 1 },
				removed: { names: ['SGT Baker, Ben'], others: 0 },
				kept: { names: [], others: 0 }
			}
		]);
		expect(describeActivity(entries[0], {}, {}, 'Alpha')).toEqual({
			summary: 'Picked 1 other person. Removed SGT Baker, Ben',
			note: null
		});
	});
});
