import { describe, expect, it, vi } from 'vitest';
import type { DashboardBootstrap } from '../contracts';
import { fetchDashboardSummary } from './dashboardSummary.server';
const { training, criticalTasks } = vi.hoisted(() => ({ training: vi.fn(), criticalTasks: vi.fn() }));
vi.mock('$features/training/index.server', () => ({ fetchDashboardTrainingSummary: training }));
vi.mock('$features/critical-tasks/index.server', () => ({ fetchCriticalTasksDashboardSummary: criticalTasks }));

describe('Dashboard independent summary reads', () => {
	it('starts Critical Tasks while Training is held and preserves a source rejection', async () => {
		let release!: (value: { trainingSummary: null; onboardingTrainingCompletions: Set<string> }) => void;
		let reject!: (error: Error) => void;
		training.mockReturnValue(
			new Promise((resolve) => {
				release = resolve;
			})
		);
		criticalTasks.mockReturnValue(
			new Promise((_resolve, fail) => {
				reject = fail;
			})
		);
		const pending = fetchDashboardSummary(
			{} as Parameters<typeof fetchDashboardSummary>[0],
			{
				personnel: [],
				trainingTypes: [],
				activeOnboardings: []
			} as unknown as DashboardBootstrap,
			{ training: true, criticalTasks: true },
			'2026-10-14',
			'UTC'
		);
		const failed = expect(pending).rejects.toThrow('Critical Tasks unavailable');
		expect(criticalTasks).toHaveBeenCalledOnce();
		release({ trainingSummary: null, onboardingTrainingCompletions: new Set() });
		reject(new Error('Critical Tasks unavailable'));
		await failed;
	});
});
