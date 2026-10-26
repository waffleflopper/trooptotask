import { describe, expect, it } from 'vitest';
import { findDisabledFeatureRoute, parseDisabledFeatures } from './featureSwitches';

describe('parseDisabledFeatures', () => {
	it('keeps known keys once, in feature order', () => {
		expect(parseDisabledFeatures(['onboarding', 'training', 'onboarding'])).toEqual(['training', 'onboarding']);
	});

	it('drops unknown keys and reads a missing column as every feature on', () => {
		expect(parseDisabledFeatures(['dutyRoster', 'lossesAndAwards', 7])).toEqual(['lossesAndAwards']);
		expect(parseDisabledFeatures(null)).toEqual([]);
	});
});

describe('findDisabledFeatureRoute', () => {
	it('finds the disabled feature that owns a route and its child routes', () => {
		expect(findDisabledFeatureRoute('/org/[orgId]/evals', ['evaluations'])).toBe('evaluations');
		expect(findDisabledFeatureRoute('/org/[orgId]/critical-tasks/(workspace)/library', ['criticalTasks'])).toBe(
			'criticalTasks'
		);
		expect(findDisabledFeatureRoute('/org/[orgId]/calendar/events/[eventId]', ['eventsAndTaskings'])).toBe(
			'eventsAndTaskings'
		);
		expect(findDisabledFeatureRoute('/org/[orgId]/calendar/taskings/[taskingId]', ['eventsAndTaskings'])).toBe(
			'eventsAndTaskings'
		);
	});

	it('ignores routes of features that are on and routes no feature owns', () => {
		expect(findDisabledFeatureRoute('/org/[orgId]/training', ['onboarding'])).toBeNull();
		expect(findDisabledFeatureRoute('/org/[orgId]/(dashboard)', ['training'])).toBeNull();
		expect(findDisabledFeatureRoute('/org/[orgId]/settings/training', ['training'])).toBeNull();
		expect(findDisabledFeatureRoute('/org/[orgId]', ['training'])).toBeNull();
		expect(findDisabledFeatureRoute('/org/[orgId]/calendar', ['eventsAndTaskings'])).toBeNull();
		expect(findDisabledFeatureRoute('/org/[orgId]/calendar/eventsheet', ['eventsAndTaskings'])).toBeNull();
		expect(findDisabledFeatureRoute(null, ['training'])).toBeNull();
	});
});
