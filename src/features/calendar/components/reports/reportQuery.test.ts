import { describe, expect, it } from 'vitest';
import {
	currentSpanLabel,
	extendRange,
	isOffCurrentSpan,
	parseReportQuery,
	reportRange,
	resizeSpan,
	serializeReportQuery,
	shiftReportStart,
	switchLens,
	type LensSpan,
	type SpanOf
} from './reportQuery';

const ahead: LensSpan = { direction: 'ahead', defaultDays: 30 };
const back: LensSpan = { direction: 'back', defaultDays: 90 };
const spanOf: SpanOf = (lens) => (lens === 'availability' ? ahead : back);

describe('parseReportQuery', () => {
	it('reads the lens, span and start from the address', () => {
		expect(parseReportQuery(new URLSearchParams('lens=time-away&days=60&start=2026-11-03'), spanOf)).toEqual({
			lens: 'time-away',
			days: 60,
			start: '2026-11-03'
		});
	});

	it('falls back to Availability for 30 days from today when a value is missing or not one of the choices', () => {
		expect(parseReportQuery(new URLSearchParams('lens=forecast&days=45&start=2026-13-40'), spanOf)).toEqual({
			lens: 'availability',
			days: 30,
			start: null
		});
		expect(parseReportQuery(new URLSearchParams(''), spanOf)).toEqual({ lens: 'availability', days: 30, start: null });
	});

	it('gives each lens its own default length', () => {
		expect(parseReportQuery(new URLSearchParams('lens=time-away'), spanOf).days).toBe(90);
		expect(parseReportQuery(new URLSearchParams('lens=time-away&days=30'), spanOf).days).toBe(30);
		expect(parseReportQuery(new URLSearchParams('lens=availability&days=90'), spanOf).days).toBe(90);
	});
});

describe('serializeReportQuery', () => {
	it('leaves the plain page plain', () => {
		expect(serializeReportQuery({ lens: 'availability', days: 30, start: null }, '2026-11-03', ahead)).toBe('');
	});

	it('leaves a lens at its own default length out, and names any other length', () => {
		expect(serializeReportQuery({ lens: 'time-away', days: 90, start: null }, '2026-11-03', back)).toBe(
			'lens=time-away'
		);
		expect(serializeReportQuery({ lens: 'time-away', days: 30, start: null }, '2026-11-03', back)).toBe(
			'lens=time-away&days=30'
		);
		expect(serializeReportQuery({ lens: 'availability', days: 90, start: null }, '2026-11-03', ahead)).toBe('days=90');
	});

	it('keeps a start that is not the current span and drops one that is', () => {
		expect(serializeReportQuery({ lens: 'availability', days: 14, start: '2026-12-03' }, '2026-11-03', ahead)).toBe(
			'days=14&start=2026-12-03'
		);
		expect(serializeReportQuery({ lens: 'assignment-load', days: 90, start: '2026-08-05' }, '2026-11-03', back)).toBe(
			'lens=assignment-load'
		);
		expect(serializeReportQuery({ lens: 'assignment-load', days: 90, start: '2026-08-06' }, '2026-11-03', back)).toBe(
			'lens=assignment-load&start=2026-08-06'
		);
	});
});

describe('reportRange', () => {
	it('spans the days from today inclusive, across a month end, for a lens that looks ahead', () => {
		expect(reportRange({ lens: 'availability', days: 30, start: null }, '2026-11-03', ahead)).toEqual({
			start: '2026-11-03',
			end: '2026-12-02'
		});
	});

	it('ends on yesterday for a lens that looks back', () => {
		expect(reportRange({ lens: 'time-away', days: 90, start: null }, '2026-11-03', back)).toEqual({
			start: '2026-08-05',
			end: '2026-11-02'
		});
		expect(reportRange({ lens: 'time-away', days: 14, start: null }, '2026-03-05', back)).toEqual({
			start: '2026-02-19',
			end: '2026-03-04'
		});
	});

	it('runs forward from a start the address names, whichever way the lens looks', () => {
		expect(reportRange({ lens: 'time-away', days: 30, start: '2026-09-01' }, '2026-11-03', back)).toEqual({
			start: '2026-09-01',
			end: '2026-09-30'
		});
	});

	it('is unknown until today is known, unless the address names a start', () => {
		expect(reportRange({ lens: 'availability', days: 14, start: null }, null, ahead)).toBeNull();
		expect(reportRange({ lens: 'time-away', days: 14, start: null }, null, back)).toBeNull();
		expect(reportRange({ lens: 'availability', days: 14, start: '2026-02-20' }, null, ahead)).toEqual({
			start: '2026-02-20',
			end: '2026-03-05'
		});
	});
});

describe('extendRange', () => {
	it('moves the end later and keeps the start', () => {
		expect(extendRange({ start: '2026-08-05', end: '2026-11-02' }, 60)).toEqual({
			start: '2026-08-05',
			end: '2027-01-01'
		});
	});
});

describe('shiftReportStart', () => {
	it('moves a lens that looks ahead one span later or earlier', () => {
		const range = { start: '2026-11-03', end: '2026-12-02' };
		expect(shiftReportStart(range, 30, 1, ahead, '2026-11-03')).toBe('2026-12-03');
		expect(shiftReportStart(range, 30, -1, ahead, '2026-11-03')).toBe('2026-10-04');
	});

	it('moves a lens that looks back one span earlier, and one later until it closes on yesterday', () => {
		const older = { start: '2026-05-07', end: '2026-08-04' };
		expect(shiftReportStart(older, 90, -1, back, '2026-11-03')).toBe('2026-02-06');
		expect(shiftReportStart(older, 90, 1, back, '2026-11-03')).toBe('2026-08-05');

		const latest = { start: '2026-08-05', end: '2026-11-02' };
		expect(shiftReportStart(latest, 90, 1, back, '2026-11-03')).toBeNull();
		expect(shiftReportStart(latest, 90, -1, back, '2026-11-03')).toBe('2026-05-07');
	});

	it('stops a later move at the latest span instead of running past yesterday', () => {
		const nearlyLatest = { start: '2026-06-10', end: '2026-09-07' };
		expect(shiftReportStart(nearlyLatest, 90, 1, back, '2026-11-03')).toBe('2026-08-05');
	});

	it('cannot move a back lens later while today is unknown', () => {
		expect(shiftReportStart({ start: '2026-05-07', end: '2026-08-04' }, 90, 1, back, null)).toBeNull();
	});
});

describe('resizeSpan', () => {
	const today = '2026-11-03';

	it('keeps the last day of an earlier back span, so a longer span looks further back', () => {
		const query = { lens: 'time-away' as const, days: 14 as const, start: '2026-10-06' };
		const range = { start: '2026-10-06', end: '2026-10-19' };
		expect(resizeSpan(query, range, 90, back, today)).toEqual({
			lens: 'time-away',
			days: 90,
			start: '2026-07-22'
		});
	});

	it('returns a back span that would reach past yesterday to the current span', () => {
		const query = { lens: 'time-away' as const, days: 14 as const, start: '2026-10-06' };
		const range = { start: '2026-10-06', end: '2026-10-19' };
		const resized = resizeSpan(
			{ ...query, start: '2026-10-21' },
			{ start: '2026-10-21', end: '2026-11-03' },
			30,
			back,
			today
		);
		expect(resized).toEqual({ lens: 'time-away', days: 30, start: null });
		expect(reportRange(resizeSpan(query, range, 30, back, today), today, back)).toEqual({
			start: '2026-09-20',
			end: '2026-10-19'
		});
	});

	it('keeps the first day of an ahead span and the current span of either lens', () => {
		const query = { lens: 'availability' as const, days: 30 as const, start: '2026-12-01' };
		expect(resizeSpan(query, { start: '2026-12-01', end: '2026-12-30' }, 14, ahead, today)).toEqual({
			...query,
			days: 14
		});
		expect(resizeSpan({ lens: 'time-away', days: 90, start: null }, null, 30, back, today)).toEqual({
			lens: 'time-away',
			days: 30,
			start: null
		});
	});
});

describe('switchLens', () => {
	it('keeps the span between lenses that look the same way', () => {
		expect(switchLens({ lens: 'time-away', days: 30, start: '2026-09-01' }, 'assignment-load', spanOf)).toEqual({
			lens: 'assignment-load',
			days: 30,
			start: '2026-09-01'
		});
	});

	it('gives the lens its own default span when it looks the other way', () => {
		expect(switchLens({ lens: 'availability', days: 14, start: '2026-12-03' }, 'time-away', spanOf)).toEqual({
			lens: 'time-away',
			days: 90,
			start: null
		});
		expect(switchLens({ lens: 'time-away', days: 60, start: '2026-09-01' }, 'availability', spanOf)).toEqual({
			lens: 'availability',
			days: 30,
			start: null
		});
	});
});

describe('current span', () => {
	it('is off when the address names a start other than the lens default', () => {
		expect(isOffCurrentSpan({ lens: 'time-away', days: 90, start: null }, '2026-11-03', back)).toBe(false);
		expect(isOffCurrentSpan({ lens: 'time-away', days: 90, start: '2026-08-05' }, '2026-11-03', back)).toBe(false);
		expect(isOffCurrentSpan({ lens: 'time-away', days: 90, start: '2026-05-07' }, '2026-11-03', back)).toBe(true);
		expect(isOffCurrentSpan({ lens: 'availability', days: 30, start: '2026-11-03' }, '2026-11-03', ahead)).toBe(false);
	});

	it('is named for the way the lens looks', () => {
		expect(currentSpanLabel(ahead)).toBe('Today');
		expect(currentSpanLabel(back)).toBe('Latest');
	});
});
