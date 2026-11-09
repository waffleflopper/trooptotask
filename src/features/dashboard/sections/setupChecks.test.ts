import { describe, expect, it } from 'vitest';
import type { TrainingType } from '$features/training/contracts';
import type { DashboardInputs } from './dashboardInputs';
import { trainingSetup } from './setupChecks';

const withTypes = (trainingTypes: Array<Pick<TrainingType, 'id' | 'archivedAt'>>) =>
	({ page: { dashboard: { data: { trainingTypes } } } }) as unknown as DashboardInputs;

describe('trainingSetup', () => {
	it('asks for a first training type when there are none', () => {
		expect(trainingSetup.isNotSetUp(withTypes([]))).toBe(true);
	});

	it('asks again when every training type is archived', () => {
		expect(trainingSetup.isNotSetUp(withTypes([{ id: 'a', archivedAt: '2030-01-02T03:04:05Z' }]))).toBe(true);
	});

	it('is set up once one active type exists beside an archived one', () => {
		expect(
			trainingSetup.isNotSetUp(
				withTypes([
					{ id: 'a', archivedAt: '2030-01-02T03:04:05Z' },
					{ id: 'b', archivedAt: null }
				])
			)
		).toBe(false);
	});
});
