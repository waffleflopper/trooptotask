import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createOnboardingSupportReader } from './supportReadProvider.server';

function reader(body: unknown) {
	return createOnboardingSupportReader(
		createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: async () => Response.json(body) }
		})
	);
}

describe('onboarding required support catalog facts', () => {
	it.each([
		null,
		{ rows: [] },
		[{ id: 'setup', organization_id: 12 }],
		[{ id: 12, organization_id: 'able' }],
		[{ id: 'setup', organization_id: 'outside' }]
	])('rejects malformed representation %j rather than a false setup count', async (body) => {
		await expect(reader(body).countTemplateStepsByOrganization(['able'])).rejects.toThrow();
	});
	it('preserves legitimate zero and counted saved rows', async () => {
		await expect(reader([]).countTemplateStepsByOrganization(['able'])).resolves.toEqual(new Map());
		await expect(
			reader([
				{ id: 'first', organization_id: 'able' },
				{ id: 'second', organization_id: 'able' }
			]).countTemplateStepsByOrganization(['able'])
		).resolves.toEqual(new Map([['able', 2]]));
	});
});
