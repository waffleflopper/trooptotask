// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { SvelteSet } from 'svelte/reactivity';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OnboardingPageView from './OnboardingPageView.svelte';
import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
import type { OnboardingStepProgress, PersonnelOnboarding } from '../onboarding.types';

function makeCtx(overrides: Partial<OnboardingPageContext> = {}): OnboardingPageContext {
	return {
		canViewOnboarding: true,
		canManageWorkflows: true,
		canManageConfig: true,
		canManageOnboarding: vi.fn(() => true),
		readOnly: false,
		hasTemplateSteps: true,
		historyUrl: '/org/org-1/onboarding/history',
		templatesUrl: '/org/org-1/onboarding/templates',
		overflowItems: [],
		modals: { open: vi.fn() },
		onboardings: [],
		filteredOnboardings: [],
		resyncError: null,
		resyncingId: null,
		expandedOnboardingId: null,
		expandedNotes: new Set(),
		noteInputs: {},
		cancellingId: null,
		getProgress: vi.fn(() => ({ completed: 0, total: 0 })),
		getPersonGroupName: vi.fn(),
		getPersonName: vi.fn(),
		getTemplateName: vi.fn(),
		getTrainingTypeName: vi.fn(() => null),
		formatTimestamp: vi.fn(),
		toggleExpand: vi.fn(),
		toggleNotes: vi.fn(),
		promptCompleteOnboarding: vi.fn(),
		openAssignTemplate: vi.fn(),
		openSwitchTemplate: vi.fn(),
		handleResync: vi.fn(),
		handleRemoveDeprecatedStep: vi.fn(),
		handleToggleCheckbox: vi.fn(),
		handleStageClick: vi.fn(),
		handleAddNote: vi.fn(),
		trainingPageUrl: '/org/org-1/training',
		...overrides
	} as unknown as OnboardingPageContext;
}

describe('OnboardingPageView', () => {
	afterEach(() => {
		cleanup();
	});

	it('preserves disabled onboarding start when template steps are missing', () => {
		render(OnboardingPageView, { props: { ctx: makeCtx({ hasTemplateSteps: false }) } });

		expect(screen.getByRole('button', { name: 'Start Onboarding' }).hasAttribute('disabled')).toBe(true);
	});

	it('renders note input for a step without a preinitialized draft value', () => {
		const step: OnboardingStepProgress = {
			id: 'step-1',
			onboardingId: 'onboarding-1',
			stepName: 'Verify packet',
			stepType: 'checkbox',
			trainingTypeId: null,
			stages: null,
			sortOrder: 1,
			completed: false,
			currentStage: null,
			notes: [],
			templateStepId: 'template-step-1',
			active: true
		};
		const onboarding: PersonnelOnboarding = {
			id: 'onboarding-1',
			personnelId: 'personnel-1',
			startedAt: '2026-05-09',
			completedAt: null,
			cancelledAt: null,
			status: 'in_progress',
			steps: [step],
			templateId: 'template-1'
		};

		expect(() =>
			render(OnboardingPageView, {
				props: {
					ctx: makeCtx({
						filteredOnboardings: [onboarding],
						onboardings: [onboarding],
						expandedOnboardingId: onboarding.id,
						expandedNotes: new SvelteSet([step.id]),
						getProgress: vi.fn(() => ({ completed: 0, total: 1 })),
						getPersonName: vi.fn(() => 'PFC Rivera'),
						getTemplateName: vi.fn(() => 'Standard Packet'),
						formatTimestamp: vi.fn(() => 'Today')
					})
				}
			})
		).not.toThrow();
		expect(screen.getByRole('textbox', { name: 'Add a note...' })).toBeTruthy();
	});

	it('does not render paperwork stage controls for inactive steps', () => {
		const inactivePaperworkStep: OnboardingStepProgress = {
			id: 'step-removed',
			onboardingId: 'onboarding-1',
			stepName: 'Finance packet',
			stepType: 'paperwork',
			trainingTypeId: null,
			stages: ['Submitted', 'Review', 'Filed'],
			sortOrder: 1,
			completed: false,
			currentStage: 'Review',
			notes: [],
			templateStepId: 'template-step-removed',
			active: false
		};
		const onboarding: PersonnelOnboarding = {
			id: 'onboarding-1',
			personnelId: 'personnel-1',
			startedAt: '2026-05-09',
			completedAt: null,
			cancelledAt: null,
			status: 'in_progress',
			steps: [inactivePaperworkStep],
			templateId: 'template-1'
		};

		render(OnboardingPageView, {
			props: {
				ctx: makeCtx({
					filteredOnboardings: [onboarding],
					onboardings: [onboarding],
					expandedOnboardingId: onboarding.id,
					getProgress: vi.fn(() => ({ completed: 0, total: 0 })),
					getPersonName: vi.fn(() => 'PFC Rivera'),
					getTemplateName: vi.fn(() => 'Standard Packet')
				})
			}
		});

		expect(screen.queryByRole('group', { name: 'Finance packet paperwork stages' })).toBeNull();
	});
});
