// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OnboardingPageView from './OnboardingPageView.svelte';
import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';

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
		overflowItems: [{ label: 'View Report', onclick: vi.fn() }],
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
});
