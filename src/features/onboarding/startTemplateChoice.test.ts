import { describe, expect, it } from 'vitest';
import type { OnboardingTemplate } from './onboarding.types';
import { preselectedTemplateId } from './startTemplateChoice';

const template = (id: string, isDefault = false): OnboardingTemplate => ({
	id,
	orgId: 'org-1',
	name: id,
	description: null,
	createdAt: null,
	isDefault
});

describe('preselectedTemplateId', () => {
	it('picks the default template even when other templates come first', () => {
		expect(preselectedTemplateId([template('a'), template('b', true), template('c')])).toBe('b');
	});

	it('picks the only template when none is the default', () => {
		expect(preselectedTemplateId([template('only')])).toBe('only');
	});

	it('leaves the choice to the operator when several templates have no default', () => {
		expect(preselectedTemplateId([template('a'), template('b')])).toBe('');
	});

	it('has nothing to pick without templates', () => {
		expect(preselectedTemplateId([])).toBe('');
	});
});
