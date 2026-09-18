// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingPageView from './OnboardingPageView.svelte';
import OnboardingModals from './OnboardingModals.svelte';
import { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
import { onboardingStore } from '../stores/onboarding.svelte';
import { onboardingTemplateStore } from '../stores/onboardingTemplate.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import { createTestOrgContext } from '$lib/test-support/orgContextBuilder';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { PersonnelOnboarding } from '../onboarding.types';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn() }));

const packet: PersonnelOnboarding = {
	id: 'packet-1',
	personnelId: 'person-1',
	templateId: 'template-1',
	startedAt: '2026-06-15',
	completedAt: null,
	cancelledAt: null,
	status: 'in_progress',
	steps: [
		{
			id: 'step-1',
			onboardingId: 'packet-1',
			templateStepId: 'template-step-1',
			stepName: 'Verify ID card',
			stepType: 'checkbox',
			trainingTypeId: null,
			stages: null,
			sortOrder: 0,
			completed: false,
			currentStage: null,
			notes: [],
			active: true
		}
	]
};

function mount() {
	const ctx = new OnboardingPageContext(new ModalRegistry(), createTestOrgContext({ orgId: 'org-1' }));
	render(OnboardingPageView, { props: { ctx } });
	render(OnboardingModals, { props: { ctx } });
	return ctx;
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
	rosterStore.load(
		[
			{
				id: 'person-1',
				firstName: 'Jane',
				lastName: 'Smith',
				rank: 'SGT',
				mos: '',
				clinicRole: '',
				groupId: null,
				groupName: ''
			},
			{
				id: 'person-2',
				firstName: 'Alex',
				lastName: 'Jones',
				rank: 'CPL',
				mos: '',
				clinicRole: '',
				groupId: null,
				groupName: ''
			}
		],
		'org-1'
	);
	onboardingTemplateStore.load(
		[{ id: 'template-1', orgId: 'org-1', name: 'Inprocessing', description: null, createdAt: '2026-06-01' }],
		[
			{
				id: 'template-step-1',
				templateId: 'template-1',
				name: 'Verify ID card',
				description: null,
				stepType: 'checkbox',
				trainingTypeId: null,
				stages: null,
				sortOrder: 0
			}
		],
		'org-1'
	);
	onboardingStore.load([packet], 'org-1');
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	onboardingStore.load([], 'reset');
	onboardingTemplateStore.load([], [], 'reset');
	rosterStore.load([], 'reset');
});

describe('Onboarding retained interactions', () => {
	it('excludes an active member from the picker and displays the newly started packet', async () => {
		const created: PersonnelOnboarding = { ...packet, id: 'packet-2', personnelId: 'person-2', steps: [] };
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Start Onboarding' }));
		const dialog = screen.getByRole('dialog', { name: 'Start Onboarding' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Member' }));
		expect(await screen.findByRole('option', { name: 'CPL Jones, Alex' })).toBeTruthy();
		expect(screen.queryByRole('option', { name: 'SGT Smith, Jane' })).toBeNull();
		await fireEvent.input(screen.getByRole('combobox'), { target: { value: 'Smith' } });
		expect(screen.queryByRole('option', { name: 'SGT Smith, Jane' })).toBeNull();
		await fireEvent.input(screen.getByRole('combobox'), { target: { value: 'Jones' } });
		await fireEvent.click(await screen.findByRole('option', { name: 'CPL Jones, Alex' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Start Onboarding' }));
		await waitFor(() => expect(onboardingStore.getById('packet-2')).toEqual(created));
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.getByText('CPL Jones, Alex')).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith(
			'/org/org-1/api/onboarding',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ personnelId: 'person-2', templateId: 'template-1', startedAt: '2026-06-15' })
			})
		);
	});

	it('rolls back a denied checkbox toggle and shows confirmed completion after retry', async () => {
		let respond!: (response: Response) => void;
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						respond = resolve;
					})
			)
			.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		const ctx = mount();
		ctx.expandedOnboardingId = 'packet-1';
		await fireEvent.click(await screen.findByRole('checkbox', { name: 'Mark complete' }));
		expect(screen.getByRole('checkbox', { name: 'Mark incomplete' }).getAttribute('aria-checked')).toBe('true');
		respond(new Response('{}', { status: 403 }));
		await waitFor(() =>
			expect(screen.getByRole('checkbox', { name: 'Mark complete' }).getAttribute('aria-checked')).toBe('false')
		);
		expect(onboardingStore.getById('packet-1')?.steps[0].completed).toBe(false);
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Mark complete' }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(screen.getByRole('checkbox', { name: 'Mark incomplete' }).getAttribute('aria-checked')).toBe('true');
		expect(onboardingStore.getById('packet-1')?.steps[0].completed).toBe(true);
		expect(fetchMock).toHaveBeenLastCalledWith(
			'/org/org-1/api/onboarding-steps',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ action: 'toggleCheckbox', stepId: 'step-1', completed: true })
			})
		);
	});
});
