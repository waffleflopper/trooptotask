import { describe, expect, it, vi } from 'vitest';
import { withCalendarTiming } from './calendarTiming';

describe('withCalendarTiming', () => {
	it('logs successful calendar phases and returns the callback result', async () => {
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

		const result = await withCalendarTiming('org-1', 'workspace-bootstrap', async () => 'ok');

		expect(result).toBe('ok');
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[calendar-load]',
			expect.objectContaining({
				orgId: 'org-1',
				phase: 'workspace-bootstrap',
				status: 'ok',
				durationMs: expect.any(Number)
			})
		);
	});

	it('logs failed calendar phases and rethrows the callback error', async () => {
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		const error = new Error('boom');

		await expect(withCalendarTiming('org-1', 'date-ranged-query', async () => Promise.reject(error))).rejects.toThrow(
			'boom'
		);
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[calendar-load]',
			expect.objectContaining({
				orgId: 'org-1',
				phase: 'date-ranged-query',
				status: 'error',
				durationMs: expect.any(Number)
			})
		);
	});
});
