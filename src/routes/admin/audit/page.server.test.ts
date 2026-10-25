import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

describe('retired Audit Log route', () => {
	it('sends the old address to Activity', () => {
		let thrown: unknown;
		try {
			load({} as never);
		} catch (cause) {
			thrown = cause;
		}

		expect(thrown).toMatchObject({ status: 308, location: '/admin/activity' });
	});
});
