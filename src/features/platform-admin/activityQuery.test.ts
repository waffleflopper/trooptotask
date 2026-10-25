import { describe, expect, it } from 'vitest';
import {
	activityInstantRange,
	activityRangePresets,
	activitySearchParams,
	activityTimeZone,
	groupActivityByDay,
	parseActivityQuery
} from './activityQuery';
import type { AuditEventRecord } from './auditSentences';

const at = (timestamp: string): AuditEventRecord => ({
	id: timestamp,
	timestamp,
	action: 'suspend_user',
	severity: 'critical',
	userId: null,
	orgId: null,
	orgName: null,
	resourceType: null,
	resourceId: null,
	ipAddress: null,
	details: null
});

describe('parseActivityQuery', () => {
	it('reads every filter from the URL', () => {
		expect(
			parseActivityQuery(new URLSearchParams('category=access&q=%20pat%20&from=2026-10-01&to=2026-10-20&page=3'))
		).toEqual({
			category: 'access',
			q: 'pat',
			from: '2026-10-01',
			to: '2026-10-20',
			page: 3
		});
	});

	it('replaces anything unrecognized with the default instead of failing', () => {
		expect(parseActivityQuery(new URLSearchParams('category=bogus&from=2026-13-40&to=yesterday&page=-2'))).toEqual({
			category: null,
			q: '',
			from: '',
			to: '',
			page: 1
		});
	});

	it('round trips through the URL and leaves defaults out', () => {
		const query = { category: 'security' as const, q: 'rate', from: '', to: '2026-10-20', page: 2 };

		expect(parseActivityQuery(activitySearchParams(query))).toEqual(query);
		expect(activitySearchParams({ category: null, q: '', from: '', to: '', page: 1 }).toString()).toBe('');
	});
});

describe('activityInstantRange', () => {
	it('spans from the first day start to the start of the day after the last day, in the viewer zone', () => {
		const range = activityInstantRange({ from: '2026-10-20', to: '2026-10-22' }, 'America/Anchorage');

		expect(range.from?.toISOString()).toBe('2026-10-20T08:00:00.000Z');
		expect(range.to?.toISOString()).toBe('2026-10-23T08:00:00.000Z');
	});

	it('leaves an unchosen side open and swaps a reversed range', () => {
		expect(activityInstantRange({ from: '', to: '' }, 'UTC')).toEqual({ from: null, to: null });
		expect(activityInstantRange({ from: '2026-10-22', to: '2026-10-20' }, 'UTC')).toEqual({
			from: new Date('2026-10-20T00:00:00.000Z'),
			to: new Date('2026-10-23T00:00:00.000Z')
		});
	});

	it('counts the day a daylight saving change shortens or lengthens as one day', () => {
		const range = activityInstantRange({ from: '2026-11-01', to: '2026-11-01' }, 'America/New_York');

		expect(range.from?.toISOString()).toBe('2026-11-01T04:00:00.000Z');
		expect(range.to?.toISOString()).toBe('2026-11-02T05:00:00.000Z');
	});
});

describe('groupActivityByDay', () => {
	it('groups by the viewer day, newest first, so the same events regroup by time zone', () => {
		const events = [at('2026-10-23T03:30:00.000Z'), at('2026-10-23T01:00:00.000Z'), at('2026-10-22T20:00:00.000Z')];

		expect(groupActivityByDay(events, 'UTC').map((day) => [day.day, day.events.length])).toEqual([
			['2026-10-23', 2],
			['2026-10-22', 1]
		]);
		expect(groupActivityByDay(events, 'America/Los_Angeles').map((day) => [day.day, day.events.length])).toEqual([
			['2026-10-22', 3]
		]);
	});
});

describe('activityRangePresets', () => {
	it('counts back from the viewer day, not the UTC day', () => {
		const now = new Date('2026-10-24T03:00:00.000Z');
		const presets = activityRangePresets('America/Los_Angeles', now);

		expect(presets.map((preset) => [preset.label, preset.getRange()])).toEqual([
			['Today', { start: '2026-10-23', end: '2026-10-23' }],
			['Last 7 days', { start: '2026-10-17', end: '2026-10-23' }],
			['Last 30 days', { start: '2026-09-24', end: '2026-10-23' }]
		]);
	});
});

describe('activityTimeZone', () => {
	it('accepts a real zone and falls back to UTC for anything else', () => {
		expect(activityTimeZone('America/Chicago')).toBe('America/Chicago');
		expect(activityTimeZone('Not/AZone')).toBe('UTC');
		expect(activityTimeZone(null)).toBe('UTC');
	});
});
