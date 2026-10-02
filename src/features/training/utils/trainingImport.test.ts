import { describe, expect, it, vi } from 'vitest';
import { parseTrainingStatus } from './trainingImport';

describe('parseTrainingStatus', () => {
	it('recognizes exempt values', () => {
		expect(parseTrainingStatus('exempt').type).toBe('exempt');
		expect(parseTrainingStatus('Exempted').type).toBe('exempt');
		expect(parseTrainingStatus('E').type).toBe('exempt');
	});

	it('recognizes completed values', () => {
		expect(parseTrainingStatus('yes').type).toBe('completed');
		expect(parseTrainingStatus('Y').type).toBe('completed');
		expect(parseTrainingStatus('done').type).toBe('completed');
		expect(parseTrainingStatus('x').type).toBe('completed');
	});

	it('sets today as the local calendar date for completed values', () => {
		const originalTimezone = process.env.TZ;
		process.env.TZ = 'America/Anchorage';
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-05T02:00:00.000Z'));

		try {
			expect(parseTrainingStatus('yes')).toEqual({
				type: 'completed',
				date: '2026-05-04',
				raw: 'yes'
			});
		} finally {
			vi.useRealTimers();
			if (originalTimezone === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTimezone;
			}
		}
	});

	it('recognizes skip values', () => {
		expect(parseTrainingStatus('no').type).toBe('skip');
		expect(parseTrainingStatus('').type).toBe('skip');
		expect(parseTrainingStatus('pending').type).toBe('skip');
	});

	it('parses date values', () => {
		const result = parseTrainingStatus('2026-03-13');
		expect(result.type).toBe('date');
		expect(result.date).toBe('2026-03-13');
	});

	it('returns invalid for unrecognized values', () => {
		expect(parseTrainingStatus('foobar').type).toBe('invalid');
	});

	it('preserves raw value', () => {
		expect(parseTrainingStatus('  Yes  ').raw).toBe('  Yes  ');
	});
});
