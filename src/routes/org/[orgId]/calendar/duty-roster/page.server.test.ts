import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

describe('legacy duty roster route load', () => {
	it('permanently redirects to the replacement Duty Rosters surface without loading legacy data', async () => {
		await expect(load({ params: { orgId: 'test-org' } } as never)).rejects.toMatchObject({
			status: 308,
			location: '/org/test-org/duty-rosters'
		});
	});
});
