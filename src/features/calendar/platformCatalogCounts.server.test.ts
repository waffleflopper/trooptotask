import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createCalendarSupportReader } from './platformCatalogCounts.server';

function reader(body: unknown) {
	return createCalendarSupportReader(
		createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: async () => Response.json(body) }
		})
	);
}
describe('Calendar required support catalog facts', () => {
	it.each([
		null,
		{ rows: [] },
		[{ id: 'setup', organization_id: 12 }],
		[{ id: 12, organization_id: 'able' }],
		[{ id: 'setup', organization_id: 'outside' }]
	])('rejects malformed representation %j rather than false default counts', async (body) => {
		await expect(reader(body).countCatalogsByOrganization(['able'])).rejects.toThrow();
	});
	it('preserves legitimate empty defaults and saved catalog counts', async () => {
		await expect(reader([]).countCatalogsByOrganization(['able'])).resolves.toEqual({
			statusTypes: new Map(),
			assignmentTypes: new Map()
		});
		await expect(
			reader([{ id: 'first', organization_id: 'able' }]).countCatalogsByOrganization(['able'])
		).resolves.toEqual({ statusTypes: new Map([['able', 1]]), assignmentTypes: new Map([['able', 1]]) });
	});

	it('rejects a missing later catalog page rather than reporting a partial saved setup count', async () => {
		const subject = createCalendarSupportReader(
			createClient('http://localhost:9', 'synthetic-service-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: {
					fetch: async (input, init) => {
						const query = new URL(new Request(input, init).url).searchParams;
						return Response.json(
							Number(query.get('offset') ?? 0) === 0
								? Array.from({ length: 1000 }, (_, index) => ({ id: `saved-${index}`, organization_id: 'able' }))
								: null
						);
					}
				}
			})
		);
		await expect(subject.countCatalogsByOrganization(['able'])).rejects.toThrow();
	});
});
