import { describe, expect, it } from 'vitest';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
import {
	calculateIctExpirationDate,
	getIctStatus,
	normalizeCriticalTasksSettings,
	resolveIctExpirationMonths
} from './ictStatus';

function task(overrides: Partial<IctTask>): IctTask {
	return {
		id: 'task-1',
		taskCode: '181-105-1001',
		title: 'Perform tactical combat casualty care',
		description: null,
		mos: [],
		expirationMonths: null,
		sortOrder: 0,
		archivedAt: null,
		createdAt: '2026-04-01T12:00:00Z',
		...overrides
	};
}

describe('ICT status utilities', () => {
	it('falls back to the default organization settings when values are unset', () => {
		expect(normalizeCriticalTasksSettings()).toEqual({
			defaultExpirationMonths: 12,
			expiringSoonWarningDays: 60
		});

		expect(normalizeCriticalTasksSettings({ defaultExpirationMonths: null, expiringSoonWarningDays: null })).toEqual({
			defaultExpirationMonths: 12,
			expiringSoonWarningDays: 60
		});
	});

	it('uses task expiration overrides before the organization default', () => {
		const settings = normalizeCriticalTasksSettings({ defaultExpirationMonths: 18, expiringSoonWarningDays: 45 });

		expect(resolveIctExpirationMonths(task({ expirationMonths: null }), settings)).toBe(18);
		expect(resolveIctExpirationMonths(task({ expirationMonths: 6 }), settings)).toBe(6);
	});

	it('calculates expiration dates from the applicable expiration duration', () => {
		const settings = normalizeCriticalTasksSettings({ defaultExpirationMonths: 12, expiringSoonWarningDays: 60 });

		expect(calculateIctExpirationDate('2026-04-14', task({ expirationMonths: null }), settings)).toBe('2027-04-14');
		expect(calculateIctExpirationDate('2026-04-14', task({ expirationMonths: 3 }), settings)).toBe('2026-07-14');
	});

	it('returns not-recorded, expiring-soon, current, and expired based on the configured warning window', () => {
		const settings = normalizeCriticalTasksSettings({ defaultExpirationMonths: 12, expiringSoonWarningDays: 60 });
		const asOf = '2026-04-14';

		expect(getIctStatus(null, task({ expirationMonths: null }), settings, asOf).status).toBe('not-recorded');
		expect(getIctStatus('2025-04-01', task({ expirationMonths: 12 }), settings, asOf).status).toBe('expired');
		expect(getIctStatus('2025-06-01', task({ expirationMonths: 12 }), settings, asOf).status).toBe('expiring-soon');
		expect(getIctStatus('2025-09-01', task({ expirationMonths: 12 }), settings, asOf).status).toBe('current');
	});
});
