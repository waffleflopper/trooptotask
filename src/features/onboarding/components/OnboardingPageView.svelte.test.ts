// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
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

	it('uses shared toolbar navigation for history', () => {
		render(OnboardingPageView, { props: { ctx: makeCtx() } });

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding controls' });
		const nav = within(toolbar).getByRole('navigation', { name: 'Onboarding sections' });

		expect(within(nav).getByRole('link', { name: 'History' }).getAttribute('href')).toBe(
			'/org/org-1/onboarding/history'
		);
		expect(within(nav).queryByRole('link', { name: 'Manage Templates' })).toBeNull();
	});

	it('keeps onboarding actions available through generated toolbar actions', async () => {
		const open = vi.fn();
		const viewReport = vi.fn();

		render(OnboardingPageView, {
			props: {
				ctx: makeCtx({
					modals: { open } as unknown as OnboardingPageContext['modals'],
					overflowItems: [{ label: 'View Report', onclick: viewReport }]
				})
			}
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Onboarding controls' });
		const actionGroup = within(toolbar).getByRole('group', { name: 'Onboarding actions' });

		expect(
			Array.from(actionGroup.children)
				.filter((element) => element.matches('button, a'))
				.map((element) => element.textContent?.trim())
		).toEqual(['View Report', 'Manage Templates', 'Start Onboarding']);

		await fireEvent.click(within(actionGroup).getByRole('button', { name: 'Start Onboarding' }));
		await fireEvent.click(within(actionGroup).getByRole('button', { name: 'View Report' }));

		expect(open).toHaveBeenCalledWith('startOnboarding');
		expect(viewReport).toHaveBeenCalled();
	});

	it('preserves disabled onboarding start when template steps are missing', () => {
		render(OnboardingPageView, { props: { ctx: makeCtx({ hasTemplateSteps: false }) } });

		expect(screen.getByRole('button', { name: 'Start Onboarding' }).hasAttribute('disabled')).toBe(true);
	});

	it('uses shared toolbar meta for read-only upgrade text', () => {
		const { container } = render(OnboardingPageView, { props: { ctx: makeCtx({ readOnly: true }) } });

		const manageTemplates = container.querySelector('[aria-describedby="toolbar-action-manage-templates-reason"]');

		expect(manageTemplates?.getAttribute('aria-disabled')).toBe('true');
		expect(manageTemplates?.getAttribute('href')).toBeNull();
		expect(manageTemplates?.getAttribute('role')).toBeNull();
		expect(manageTemplates?.getAttribute('tabindex')).toBeNull();
		expect(screen.queryByRole('link', { name: 'Manage Templates' })).toBeNull();
		expect(screen.getByRole('status', { name: 'Upgrade to edit' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Start Onboarding' }).hasAttribute('disabled')).toBe(true);
	});
});
