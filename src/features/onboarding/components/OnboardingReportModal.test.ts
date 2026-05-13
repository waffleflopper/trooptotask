// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$lib/types';
import type { OnboardingTemplate, PersonnelOnboarding } from '../onboarding.types';
import OnboardingReportModal from './OnboardingReportModal.svelte';

const template: OnboardingTemplate = {
	id: 'template-1',
	orgId: 'org-1',
	name: 'Standard Inprocessing',
	description: null,
	createdAt: '2026-03-01'
};

const personnel = [
	{
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane'
	}
] as Personnel[];

const onboardings: PersonnelOnboarding[] = [
	{
		id: 'onboarding-1',
		personnelId: 'person-1',
		startedAt: '2026-03-02',
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		templateId: template.id,
		steps: [
			{
				id: 'step-progress-1',
				onboardingId: 'onboarding-1',
				stepName: 'Initial paperwork',
				stepType: 'paperwork',
				trainingTypeId: null,
				stages: ['Submitted'],
				sortOrder: 0,
				completed: false,
				currentStage: 'Submitted',
				notes: [],
				templateStepId: 'template-step-1',
				active: true
			}
		]
	}
];

describe('OnboardingReportModal', () => {
	afterEach(() => {
		cleanup();
	});

	it('shows the shared template filter when one concrete template can be selected', () => {
		render(OnboardingReportModal, {
			props: {
				onboardings,
				personnel,
				templates: [template],
				trainingTypeNames: new Map(),
				onClose: vi.fn()
			}
		});

		expect(screen.getByRole('dialog', { name: 'Onboarding Report' })).toBeTruthy();
		expect(screen.getByText(/Review the current bottlenecks/)).toBeTruthy();
		const templateTrigger = screen.getByRole('button', { name: 'Template' });
		expect(templateTrigger).toBeTruthy();
		expect(screen.getByText('Initial paperwork')).toBeTruthy();
	});
});
