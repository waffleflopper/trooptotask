// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingPageView from './OnboardingPageView.svelte';
import OnboardingModals from './OnboardingModals.svelte';
import { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
import { onboardingStore } from '../stores/onboarding.svelte';
import { onboardingTemplateStore } from '../stores/onboardingTemplate.svelte';
import { personnelRosterHydration } from '$features/personnel';
import { createTestOrgContext } from '$lib/test-support/orgContextBuilder';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { PersonnelOnboarding } from '../onboarding.types';
import type { RankCatalogEntry } from '$features/personnel/contracts';

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

function mount(rankCatalog: RankCatalogEntry[] = []) {
	const ctx = new OnboardingPageContext(new ModalRegistry(), createTestOrgContext({ orgId: 'org-1' }));
	render(OnboardingPageView, { props: { ctx } });
	render(OnboardingModals, { props: { ctx, rankCatalog } });
	return ctx;
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
	personnelRosterHydration.load(
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
	personnelRosterHydration.load([], 'reset');
});

describe('Onboarding retained interactions', () => {
	it('creates a Person with the supplied active rank and starts their packet with the saved ID', async () => {
		const person = {
			id: 'created-person',
			rank: 'VRA',
			lastName: 'Nolan',
			firstName: 'Avery',
			mos: '',
			clinicRole: '',
			groupId: null,
			groupName: ''
		};
		const created: PersonnelOnboarding = { ...packet, id: 'created-packet', personnelId: person.id, steps: [] };
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(person), { status: 201 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		mount([
			{
				code: 'VRA',
				label: 'Verification active',
				service: 'custom',
				category: 'custom',
				payGrade: 'ungraded',
				state: 'active',
				sortOrder: 0
			},
			{
				code: 'VRR',
				label: 'Verification retired',
				service: 'custom',
				category: 'custom',
				payGrade: 'ungraded',
				state: 'retired',
				sortOrder: 1
			}
		]);
		await fireEvent.click(screen.getByRole('button', { name: 'Start Onboarding' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add Person' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Rank' }));
		expect(screen.queryByRole('option', { name: 'VRR' })).toBeNull();
		await fireEvent.click(await screen.findByRole('option', { name: 'VRA' }));
		await fireEvent.input(screen.getByLabelText(/Last Name/i), { target: { value: 'Nolan' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Avery' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Member' }).textContent).toContain('VRA Nolan, Avery')
		);
		await fireEvent.click(
			within(screen.getByRole('dialog', { name: 'Start Onboarding' })).getByRole('button', { name: 'Start Onboarding' })
		);
		await waitFor(() => expect(onboardingStore.getById('created-packet')).toEqual(created));
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			'/org/org-1/api/personnel',
			expect.objectContaining({
				method: 'POST',
				body: expect.any(String)
			})
		);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
			rank: 'VRA',
			lastName: 'Nolan',
			firstName: 'Avery'
		});
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'/org/org-1/api/onboarding',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ personnelId: 'created-person', templateId: 'template-1', startedAt: '2026-06-15' })
			})
		);
	});

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
