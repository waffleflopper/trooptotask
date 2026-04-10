import { describe, expect, it, vi } from 'vitest';
import { withDashboardTiming } from './dashboardTiming';

describe('withDashboardTiming', () => {
	it('logs successful dashboard phases and returns the callback result', async () => {
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

		const result = await withDashboardTiming('org-1', 'summary', async () => 'ok');

		expect(result).toBe('ok');
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[dashboard-load]',
			expect.objectContaining({
				orgId: 'org-1',
				phase: 'summary',
				status: 'ok',
				durationMs: expect.any(Number)
			})
		);
	});

	it('logs failed dashboard phases and rethrows the callback error', async () => {
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		const error = new Error('boom');

		await expect(withDashboardTiming('org-1', 'support', async () => Promise.reject(error))).rejects.toThrow('boom');
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[dashboard-load]',
			expect.objectContaining({
				orgId: 'org-1',
				phase: 'support',
				status: 'error',
				durationMs: expect.any(Number)
			})
		);
	});
});
