// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { OnboardingTemplate, OnboardingTemplateStep } from '$features/onboarding/onboarding.types';

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		readOnly: false
	})
}));

afterEach(() => {
	cleanup();
});

function renderTemplatesPage({
	templates = [
		{
			id: 'template-1',
			orgId: 'org-1',
			name: 'Standard Arrival',
			description: 'Default packet',
			createdAt: '2026-01-01T00:00:00.000Z'
		}
	],
	templateSteps = [
		{
			id: 'step-1',
			templateId: 'template-1',
			name: 'Initial counseling',
			description: null,
			stepType: 'checkbox',
			trainingTypeId: null,
			stages: null,
			sortOrder: 0
		}
	]
}: {
	templates?: OnboardingTemplate[];
	templateSteps?: OnboardingTemplateStep[];
} = {}) {
	return render(Page, {
		props: {
			data: {
				session: null,
				orgId: 'org-1',
				templates,
				templateSteps,
				trainingTypes: []
			}
		}
	});
}

describe('onboarding templates page', () => {
	it('uses a floating toolbar for navigation and template creation', () => {
		renderTemplatesPage();

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding template controls' });
		expect(within(toolbar).getByRole('link', { name: 'Onboarding' }).getAttribute('href')).toBe(
			'/org/org-1/onboarding'
		);
		expect(within(toolbar).getByRole('button', { name: 'Add Template' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Manage Templates' })).toBeNull();
	});

	it('does not render redundant template summary cards above the editor', () => {
		renderTemplatesPage();

		expect(screen.queryByText('Reusable onboarding packet definitions')).toBeNull();
		expect(screen.queryByText('Template steps currently configured')).toBeNull();
	});
});
