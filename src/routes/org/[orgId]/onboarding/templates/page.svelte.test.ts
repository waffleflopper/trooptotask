// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { OnboardingTemplate, OnboardingTemplateStep } from '$features/onboarding/onboarding.types';

let orgReadOnly = false;
let canConfigure = true;

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		readOnly: orgReadOnly,
		affordanceForFeatureAction: () => ({
			visible: canConfigure || orgReadOnly,
			disabled: orgReadOnly,
			allowed: canConfigure && !orgReadOnly,
			reason: orgReadOnly
				? 'denied:read-only-overlay'
				: canConfigure
					? 'allowed:capability'
					: 'denied:missing-capability',
			explanation: '',
			decision: {}
		})
	})
}));

afterEach(() => {
	cleanup();
	orgReadOnly = false;
	canConfigure = true;
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
	it('preserves add template disabled state while adding', async () => {
		renderTemplatesPage();

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding template controls' });
		const addTemplate = within(toolbar).getByRole('button', { name: 'Add Template' });

		await fireEvent.click(addTemplate);

		expect(within(toolbar).getByRole('button', { name: 'Add Template' }).hasAttribute('disabled')).toBe(true);
	});

	it('hides template creation when the organization is read-only', () => {
		orgReadOnly = true;

		renderTemplatesPage();

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding template controls' });
		expect(within(toolbar).queryByRole('button', { name: 'Add Template' })).toBeNull();
	});

	it('hides template creation without Onboarding configure affordance', () => {
		canConfigure = false;

		renderTemplatesPage();

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding template controls' });
		expect(within(toolbar).queryByRole('button', { name: 'Add Template' })).toBeNull();
	});

	it('does not render redundant template summary cards above the editor', () => {
		renderTemplatesPage();

		expect(screen.queryByText('Reusable onboarding packet definitions')).toBeNull();
		expect(screen.queryByText('Template steps currently configured')).toBeNull();
	});
});
