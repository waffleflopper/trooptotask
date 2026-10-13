// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OnboardingKanbanView from './OnboardingKanbanView.svelte';
import { MODAL_IDS, OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
import { onboardingTemplateStore } from '../stores/onboardingTemplate.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { openToolbarMore, stubToolbarWidths } from '$lib/test-support/toolbarWidths';

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: gotoMock, invalidate: vi.fn(), invalidateAll: vi.fn() }));

const toolbarName = 'Onboarding controls';

function mount(access: 'view' | 'operate' | 'configure' = 'configure', withSteps = true) {
	onboardingTemplateStore.load(
		[{ id: 'template-1', orgId: 'org-1', name: 'Arrival', description: null, createdAt: null }],
		withSteps
			? [
					{
						id: 'step-1',
						templateId: 'template-1',
						name: 'Verify ID card',
						description: null,
						stepType: 'checkbox',
						trainingTypeId: null,
						stages: null,
						sortOrder: 0
					}
				]
			: [],
		'org-1'
	);
	const ctx = new OnboardingPageContext(new ModalRegistry(), {
		orgId: 'org-1',
		orgUrlSegment: 'org-1',
		...createClientAccess({
			membershipRole: 'member',
			capabilityMap: { ...createCapabilityMap('none'), onboarding: access }
		})
	});
	render(OnboardingKanbanView, { props: { ctx } });
	return ctx;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	gotoMock.mockReset();
	onboardingTemplateStore.load([], [], 'org-test-reset');
});

describe('Onboarding pipeline toolbar', () => {
	it('links History and Templates and starts an onboarding from the primary action', async () => {
		const ctx = mount();

		const row = within(screen.getByRole('toolbar', { name: toolbarName }));
		expect(row.getByRole('link', { name: 'History' }).getAttribute('href')).toBe('/org/org-1/onboarding/history');
		expect(row.getByRole('link', { name: 'Templates' }).getAttribute('href')).toBe('/org/org-1/onboarding/templates');
		await fireEvent.click(row.getByRole('button', { name: 'Start Onboarding' }));
		expect(ctx.modals.isOpen(MODAL_IDS.startOnboarding)).toBe(true);
	});

	it('keeps Start Onboarding disabled until a template has steps', () => {
		mount('configure', false);

		const start = within(screen.getByRole('toolbar', { name: toolbarName })).getByRole('button', {
			name: 'Start Onboarding'
		});
		expect(start.hasAttribute('disabled')).toBe(true);
	});

	it('opens History and Templates from More while Start Onboarding stays on the row', async () => {
		const widths = stubToolbarWidths();
		mount();
		await widths.foldAll();

		const row = within(screen.getByRole('toolbar', { name: toolbarName }));
		expect(row.queryByRole('link', { name: 'History' })).toBeNull();
		expect(row.getByRole('button', { name: 'Start Onboarding' })).toBeTruthy();

		let menu = await openToolbarMore(toolbarName);
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Templates' }));
		await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/org/org-1/onboarding/templates'));

		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
		menu = await openToolbarMore(toolbarName);
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'History' }));
		await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/org/org-1/onboarding/history'));
	});

	it('hides Templates and Start Onboarding from a viewer, including inside More', async () => {
		const widths = stubToolbarWidths();
		mount('view');
		await widths.foldAll();

		expect(screen.queryByRole('button', { name: 'Start Onboarding' })).toBeNull();
		const menu = await openToolbarMore(toolbarName);
		expect(within(menu).getByRole('menuitem', { name: 'History' })).toBeTruthy();
		expect(within(menu).queryByRole('menuitem', { name: 'Templates' })).toBeNull();
	});
});
