import { describe, it, expect } from 'vitest';
import {
	getProgress,
	isStepDeprecated,
	isTrainingStepComplete,
	getPaperworkStageIndex,
	formatTimestamp
} from './OnboardingPageContext.svelte';
import type { PersonnelOnboarding, OnboardingStepProgress } from '../onboarding.types';

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
		active: true,
		...overrides
	};
}

function makeOnboarding(overrides: Partial<PersonnelOnboarding> = {}): PersonnelOnboarding {
	return {
		id: 'ob-1',
		personnelId: 'p-1',
		startedAt: '2026-01-01T00:00:00Z',
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		steps: [],
		templateId: 'tpl-1',
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
	it('returns step.completed (server-derived)', () => {
		const incomplete = makeStep({ stepType: 'training', trainingTypeId: 'tt-1', completed: false });
		expect(isTrainingStepComplete(incomplete)).toBe(false);

		const complete = makeStep({ stepType: 'training', trainingTypeId: 'tt-1', completed: true });
		expect(isTrainingStepComplete(complete)).toBe(true);
	});
});

// ── getProgress ────────────────────────────────────────────────

describe('getProgress', () => {
	it('returns 0/0 when there are no steps', () => {
		const ob = makeOnboarding({ steps: [] });
		expect(getProgress(ob)).toEqual({ completed: 0, total: 0 });
	});

	it('excludes inactive steps from count', () => {
		const inactiveStep = makeStep({ id: 's-inactive', active: false, completed: true });
		const ob = makeOnboarding({ steps: [inactiveStep] });
		expect(getProgress(ob)).toEqual({ completed: 0, total: 0 });
	});

	it('counts a completed checkbox step', () => {
		const step = makeStep({ stepType: 'checkbox', completed: true });
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob)).toEqual({ completed: 1, total: 1 });
	});

	it('counts an incomplete checkbox step', () => {
		const step = makeStep({ stepType: 'checkbox', completed: false });
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob)).toEqual({ completed: 0, total: 1 });
	});

	it('counts paperwork as complete when completed=true', () => {
		const step = makeStep({
			id: 's-paper',
			stepType: 'paperwork',
			stages: ['Draft', 'Signed', 'Filed'],
			currentStage: 'Filed',
			completed: true
		});
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob)).toEqual({ completed: 1, total: 1 });
	});

	it('counts paperwork as incomplete when completed=false', () => {
		const step = makeStep({
			id: 's-paper',
			stepType: 'paperwork',
			stages: ['Draft', 'Signed', 'Filed'],
			currentStage: 'Draft',
			completed: false
		});
		const ob = makeOnboarding({ steps: [step] });
		expect(getProgress(ob)).toEqual({ completed: 0, total: 1 });
	});

	it('counts training step as complete when completed=true (server-derived)', () => {
		const trainingStep = makeStep({
			id: 's-train',
			stepType: 'training',
			trainingTypeId: 'tt-1',
			completed: true
		});
		const ob = makeOnboarding({ steps: [trainingStep] });
		expect(getProgress(ob)).toEqual({ completed: 1, total: 1 });
	});

	it('handles mixed step types with mixed completion', () => {
		const steps = [
			makeStep({ id: 's1', stepType: 'checkbox', completed: true }),
			makeStep({ id: 's2', stepType: 'paperwork', completed: false }),
			makeStep({ id: 's3', stepType: 'training', trainingTypeId: 'tt-1', completed: true }),
			makeStep({ id: 's4', stepType: 'checkbox', completed: false, active: false })
		];
		const ob = makeOnboarding({ steps });
		expect(getProgress(ob)).toEqual({ completed: 2, total: 3 });
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
