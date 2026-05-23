import { describe, expect, it } from 'vitest';
import { checkRateLimit } from './rateLimit';

describe('global in-memory rate limits', () => {
	it('leaves Access Request submission to the route-level durable limiter', () => {
		const ip = '198.51.100.42';

		for (let attempt = 0; attempt < 6; attempt += 1) {
			expect(checkRateLimit(ip, '/api/access-requests', 'POST')).toEqual({ limited: false });
		}
	});
});
