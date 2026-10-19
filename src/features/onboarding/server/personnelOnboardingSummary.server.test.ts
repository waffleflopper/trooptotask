import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelOnboarding } from '../onboarding.types';
import { loadPersonnelOnboardingSummary } from './personnelOnboardingSummary.server';

const person = { id: 'okafor' } as Personnel;

function packet(overrides: Partial<PersonnelOnboarding>): PersonnelOnboarding {
	const step = (id: string, completed: boolean, active = true) => ({
		id,
		onboardingId: 'packet-1',
		stepName: id,
		stepType: 'checkbox' as const,
		trainingTypeId: null,
		stages: null,
		sortOrder: 0,
		completed,
		currentStage: null,
		notes: [],
		templateStepId: null,
		active,
		progressChangedAt: '2023-02-01T00:00:00Z'
	});
	return {
		id: 'packet-1',
		personnelId: person.id,
		startedAt: '2023-02-01',
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		templateId: null,
		steps: [step('a', true), step('b', false), step('retired', false, false)],
		...overrides
	};
}

describe('loadPersonnelOnboardingSummary', () => {
	it.each([
		[null, { state: 'none' }],
		[packet({}), { state: 'in-progress', startedAt: '2023-02-01', completedSteps: 1, totalSteps: 2 }],
		[
			packet({ status: 'completed', completedAt: '2023-03-14' }),
			{ state: 'complete', completedAt: '2023-03-14', completedSteps: 1, totalSteps: 2 }
		]
	])('summarizes the latest packet %#', async (latest, expected) => {
		const summary = await loadPersonnelOnboardingSummary({
			onboardingWorkflow: { findLatestPacketForPersonnel: async () => latest },
			loadAuthorizedPerson: async () => person
		});

		expect(summary).toEqual(expected);
	});
});
