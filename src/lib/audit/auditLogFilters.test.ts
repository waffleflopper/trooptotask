import { describe, expect, it } from 'vitest';
import {
	auditLogFilterParams,
	decodeAuditLogCursor,
	encodeAuditLogCursor,
	hasAuditLogFilters,
	parseAuditLogFilters
} from './auditLogFilters';

const PERSON = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';

describe('audit log filters in the address', () => {
	it('round-trip through the query string in a fixed order', () => {
		const filters = {
			personId: PERSON,
			userId: MEMBER,
			kind: 'availability.deleted',
			from: '2026-10-01',
			to: '2026-10-31'
		};

		const query = auditLogFilterParams(filters).toString();

		expect(query).toBe(`person=${PERSON}&member=${MEMBER}&kind=availability.deleted&from=2026-10-01&to=2026-10-31`);
		expect(parseAuditLogFilters(new URLSearchParams(query))).toEqual(filters);
	});

	it('leave out any value that is not valid, so a hand-edited link still opens the log', () => {
		const params = new URLSearchParams({
			person: 'not-a-uuid',
			member: MEMBER,
			kind: 'x; drop table',
			from: '2026-13-45',
			to: '2026-10-31'
		});

		expect(parseAuditLogFilters(params)).toEqual({ userId: MEMBER, to: '2026-10-31' });
	});

	it('count as filters only when one is set', () => {
		expect(hasAuditLogFilters({})).toBe(false);
		expect(hasAuditLogFilters({ from: '2026-10-01' })).toBe(true);
	});
});

describe('audit log cursor', () => {
	const id = '33333333-3333-4333-8333-333333333333';

	it.each(['2026-10-01T12:00:00Z', '2026-10-01T12:00:00.123456+00:00', '2026-10-01T12:00:00.5-04:00'])(
		'round-trips the database timestamp %s untouched',
		(timestamp) => {
			expect(decodeAuditLogCursor(encodeAuditLogCursor({ timestamp, id }))).toEqual({ timestamp, id });
		}
	);

	it.each([
		'',
		'2026-10-01T12:00:00Z',
		`2026-10-01_${id}`,
		`2026-10-01T12:00:00Z_not-a-uuid`,
		`2026-10-01T12:00:00Z",id.gt."_${id}`,
		`2026-10-01T12:00:00_${id}`
	])('refuses %j, which no page returned', (text) => {
		expect(decodeAuditLogCursor(text)).toBeNull();
	});
});
