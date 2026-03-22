import { describe, it, expect } from 'vitest';
import {
	getProgress,
	isStepDeprecated,
	isTrainingStepComplete,
	getPaperworkStageIndex,
	formatTimestamp,
	filterOnboardings
} from './OnboardingPageContext.svelte';
import type { PersonnelOnboarding, OnboardingStepProgress } from '../onboarding.types';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';

// ── Fixtures ──────────────────────────────────────────────────

function makeStep(overrides: Partial<OnboardingStepProgress> = {}): OnboardingStepProgress {
	return {
		id: 'step-1',
		onboardingId: 'ob-1',
		stepName: 'Sign paperwork',
		stepType: 'checkbox',
		trainingTypeId: null,
		stages: null,
		sortOrder: 0,
		completed: false,
		currentStage: null,
		notes: [],
		templateStepId: 'tpl-step-1',
		...overrides
	};
}

function makeOnboarding(overrides: Partial<PersonnelOnboarding> = {}): PersonnelOnboarding {
	return {
		id: 'ob-1',
		personnelId: 'p-1',
		startedAt: '2026-01-01T00:00:00Z',
		completedAt: null,
		status: 'in_progress',
		steps: [],
		templateId: 'tpl-1',
		...overrides
	};
}

function makeTrainingType(overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id: 'tt-1',
		name: 'CPR',
		sortOrder: 0,
		color: '#3b82f6',
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		requiredForRoles: [],
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		...overrides
	};
}

function makeTraining(overrides: Partial<PersonnelTraining> = {}): PersonnelTraining {
	return {
		id: 'tr-1',
		personnelId: 'p-1',
		trainingTypeId: 'tt-1',
		completionDate: '2026-01-01',
		expirationDate: null,
		notes: null,
		certificateUrl: null,
		...overrides
	};
}

// ── isStepDeprecated ──────────────────────────────────────────

describe('isStepDeprecated', () => {
	it('returns false when templateStepId is null (legacy step)', () => {
		const step = makeStep({ templateStepId: null });
		expect(isStepDeprecated(step, [])).toBe(false);
	});

	it('returns false when templateStepId exists in known steps', () => {
		const step = makeStep({ templateStepId: 'tpl-step-1' });
		expect(isStepDeprecated(step, ['tpl-step-1', 'tpl-step-2'])).toBe(false);
	});

	it('returns true when templateStepId no longer exists in any template', () => {
		const step = makeStep({ templateStepId: 'removed-step' });
		expect(isStepDeprecated(step, ['tpl-step-1'])).toBe(true);
	});

	it('returns true when known step IDs list is empty', () => {
		const step = makeStep({ templateStepId: 'tpl-step-1' });
		expect(isStepDeprecated(step, [])).toBe(true);
	});
});

// ── isTrainingStepComplete ─────────────────────────────────────

describe('isTrainingStepComplete', () => {
	it('returns false when step has no trainingTypeId', () => {
		const step = makeStep({ stepType: 'training', trainingTypeId: null });
		expect(isTrainingStepComplete(step, 'p-1', [], [])).toBe(false);
	});

	it('returns true when person is exempt', () => {
		const step = makeStep({ stepType: 'training', trainingTypeId: 'tt-1' });
		const type = makeTrainingType({ canBeExempted: true, exemptPersonnelIds: ['p-1'] });
		expect(isTrainingStepComplete(step, 'p-1', [type], [])).toBe(true);
	});

	it('returns false when no training record exists', () => {
		const step = makeStep({ stepType: 'training', trainingTypeId: 'tt-1' });
		const type = makeTrainingType();
		expect(isTrainingStepComplete(step, 'p-1', [type], [])).toBe(false);
	});

	it('returns true when training never expires and record exists', () => {
		const step = makeStep({ stepType: 'training', trainingTypeId: 'tt-1' });
		const type = makeTrainingType({ expirationMonths: null, expirationDateOnly: false });
		const training = makeTraining({ completionDate: '2026-01-01', expirationDate: null });
		expect(isTrainingStepComplete(step, 'p-1', [type], [training])).toBe(true);
	});

	it('returns true when expiration date is in the future', () => {
		const step = makeStep({ stepType: 'training', trainingTypeId: 'tt-1' });
		const type = makeTrainingType({ expirationMonths: 12 });
		const futureDate = new Date();
		futureDate.setFullYear(futureDate.getFullYear() + 1);
		const training = makeTraining({ expirationDate: futureDate.toISOString().split('T')[0] });
		expect(isTrainingStepComplete(step, 'p-1', [type], [training])).toBe(true);
	});

	it('returns false when expiration date is in the past', () => {
		const step = makeStep({ stepType: 'training', trainingTypeId: 'tt-1' });
		const type = makeTrainingType({ expirationMonths: 12 });
		const training = makeTraining({ expirationDate: '2020-01-01' });
		expect(isTrainingStepComplete(step, 'p-1', [type], [training])).toBe(false);
	});

	it('returns true when no expiration date but completionDate is set', () => {
		const step = makeStep({ stepType: 'training', trainingTypeId: 'tt-1' });
		const type = makeTrainingType({ expirationMonths: 12 });
		const training = makeTraining({ completionDate: '2026-01-01', expirationDate: null });
		expect(isTrainingStepComplete(step, 'p-1', [type], [training])).toBe(true);
	});
});

// ── getProgress ────────────────────────────────────────────────

describe('getProgress', () => {
	it('returns 0/0 when there are no steps', () => {
		const ob = makeOnboarding({ steps: [] });
		expect(getProgress(ob, [], [], [])).toEqual({ completed: 0, total: 0 });
	});

	it('excludes deprecated steps from count', () => {
		const deprecatedStep = makeStep({ id: 's-dep', templateStepId: 'removed', completed: true });
		const ob = makeOnboarding({ steps: [deprecatedStep] });
		// No known step IDs → deprecated
		expect(getProgress(ob, [], [], [])).toEqual({ completed: 0, total: 0 });
	});

	it('counts a completed checkbox step', () => {
		const step = makeStep({ stepType: 'checkbox', completed: true, templateStepId: 'tpl-step-1' });
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob, ['tpl-step-1'], [], [])).toEqual({ completed: 1, total: 1 });
	});

	it('counts an incomplete checkbox step', () => {
		const step = makeStep({ stepType: 'checkbox', completed: false, templateStepId: 'tpl-step-1' });
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob, ['tpl-step-1'], [], [])).toEqual({ completed: 0, total: 1 });
	});

	it('counts paperwork as complete when at last stage', () => {
		const step = makeStep({
			id: 's-paper',
			stepType: 'paperwork',
			stages: ['Draft', 'Signed', 'Filed'],
			currentStage: 'Filed',
			completed: false,
			templateStepId: 'tpl-step-1'
		});
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob, ['tpl-step-1'], [], [])).toEqual({ completed: 1, total: 1 });
	});

	it('counts paperwork as incomplete when not at last stage', () => {
		const step = makeStep({
			id: 's-paper',
			stepType: 'paperwork',
			stages: ['Draft', 'Signed', 'Filed'],
			currentStage: 'Draft',
			completed: false,
			templateStepId: 'tpl-step-1'
		});
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob, ['tpl-step-1'], [], [])).toEqual({ completed: 0, total: 1 });
	});

	it('counts training step as complete when training record exists and valid', () => {
		const trainingStep = makeStep({
			id: 's-train',
			stepType: 'training',
			trainingTypeId: 'tt-1',
			templateStepId: 'tpl-step-1'
		});
		const ob = makeOnboarding({ steps: [trainingStep] });
		const type = makeTrainingType({ expirationMonths: null, expirationDateOnly: false });
		const training = makeTraining({ completionDate: '2026-01-01' });
		expect(getProgress(ob, ['tpl-step-1'], [type], [training])).toEqual({ completed: 1, total: 1 });
	});
});

// ── getPaperworkStageIndex ─────────────────────────────────────

describe('getPaperworkStageIndex', () => {
	it('returns 0 when currentStage is null', () => {
		const step = makeStep({ stages: ['A', 'B', 'C'], currentStage: null });
		expect(getPaperworkStageIndex(step)).toBe(0);
	});

	it('returns 0 when stages is null', () => {
		const step = makeStep({ stages: null, currentStage: null });
		expect(getPaperworkStageIndex(step)).toBe(0);
	});

	it('returns correct index for current stage', () => {
		const step = makeStep({ stages: ['Draft', 'Signed', 'Filed'], currentStage: 'Signed' });
		expect(getPaperworkStageIndex(step)).toBe(1);
	});

	it('returns 0 when currentStage not found in stages', () => {
		const step = makeStep({ stages: ['A', 'B'], currentStage: 'Unknown' });
		expect(getPaperworkStageIndex(step)).toBe(0);
	});
});

// ── formatTimestamp ────────────────────────────────────────────

describe('formatTimestamp', () => {
	it('formats a valid ISO string to readable format', () => {
		const result = formatTimestamp('2026-01-15T14:30:00.000Z');
		expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2} at \d{1,2}:\d{2} (AM|PM)$/);
	});
});

// ── filterOnboardings ──────────────────────────────────────────

describe('filterOnboardings', () => {
	const active = makeOnboarding({ id: 'a', status: 'in_progress' });
	const completed = makeOnboarding({ id: 'b', status: 'completed' });
	const cancelled = makeOnboarding({ id: 'c', status: 'cancelled' });

	it('returns only in_progress when filter is "active"', () => {
		const result = filterOnboardings([active, completed, cancelled], 'active');
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('a');
	});

	it('returns all onboardings when filter is "all"', () => {
		const result = filterOnboardings([active, completed, cancelled], 'all');
		expect(result).toHaveLength(3);
	});

	it('returns empty array when list is empty', () => {
		expect(filterOnboardings([], 'all')).toHaveLength(0);
		expect(filterOnboardings([], 'active')).toHaveLength(0);
	});
});
