import { describe, expect, it } from 'vitest';
import { createReportRun } from './createReportRun.svelte';

describe('createReportRun', () => {
	it('runs load through compute and exposes the ready result', async () => {
		const report = createReportRun({
			validate: () => null,
			load: async () => [1, 2, 3],
			compute: (raw) => raw.reduce((sum, value) => sum + value, 0)
		});

		expect(report.status).toBe('idle');
		expect(report.canRun).toBe(true);

		await report.run();

		expect(report.status).toBe('ready');
		expect(report.result).toBe(6);
		expect(report.error).toBeNull();
	});

	it('blocks invalid runs with the validation message', async () => {
		const report = createReportRun({
			validate: () => 'No groups selected.',
			load: async () => {
				throw new Error('load should not run');
			},
			compute: (raw: unknown) => raw
		});

		expect(report.canRun).toBe(false);

		await report.run();

		expect(report.status).toBe('error');
		expect(report.result).toBeNull();
		expect(report.error).toBe('No groups selected.');
	});
});
