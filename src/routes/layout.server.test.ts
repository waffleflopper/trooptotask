import { describe, expect, it } from 'vitest';
import { load } from './+layout.server';

describe('root layout server load', () => {
	it('does not serialize request cookies into page data', async () => {
		const result = await load({
			locals: {
				session: { user: { id: 'user-1' } }
			},
			cookies: {
				getAll: () => [
					{ name: 'sb-access-token', value: 'secret-access-token' },
					{ name: 'sb-refresh-token', value: 'secret-refresh-token' }
				]
			}
		} as Parameters<typeof load>[0]);

		expect(result).toEqual({
			session: { user: { id: 'user-1' } }
		});
		expect(result).not.toHaveProperty('cookies');
	});
});
