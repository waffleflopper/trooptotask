import { afterEach, describe, expect, it } from 'vitest';
import { rosterCreatedRange } from './rosterCreatedRange';

const originalTimezone = process.env.TZ;
afterEach(() => {
	if (originalTimezone === undefined) delete process.env.TZ;
	else process.env.TZ = originalTimezone;
});

describe('rosterCreatedRange', () => {
	it('bounds the viewer local days, including a 23-hour daylight-saving day', () => {
		process.env.TZ = 'America/New_York';

		expect(rosterCreatedRange('2026-03-08', '2026-03-08')).toEqual({
			createdFrom: '2026-03-08T05:00:00.000Z',
			createdBefore: '2026-03-09T04:00:00.000Z'
		});
	});

	it('leaves an unset day unbounded', () => {
		process.env.TZ = 'Asia/Seoul';

		expect(rosterCreatedRange('', '2026-10-14')).toEqual({ createdBefore: '2026-10-14T15:00:00.000Z' });
		expect(rosterCreatedRange('', '')).toEqual({});
	});
});
