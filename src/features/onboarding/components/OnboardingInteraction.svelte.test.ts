// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingKanbanView from './OnboardingKanbanView.svelte';
import OnboardingModals from './OnboardingModals.svelte';
import { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
import { onboardingStore } from '../stores/onboarding.svelte';
import { onboardingTemplateStore } from '../stores/onboardingTemplate.svelte';
import { personnelRosterHydration } from '$features/personnel';
import { createTestOrgContext } from '$lib/test-support/orgContextBuilder';
import { toastStore } from '$lib/stores/toast.svelte';
import { NONE_TEST_CAPABILITY_MAP } from '$lib/test-support/orgContextBuilder';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { PersonnelOnboarding } from '../onboarding.types';
import type { RankCatalogEntry } from '$features/personnel/contracts';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn(), invalidateAll: vi.fn() }));

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

function mount(rankCatalog: RankCatalogEntry[] = [], rankCatalogUnavailable = false) {
	const ctx = new OnboardingPageContext(new ModalRegistry(), createTestOrgContext({ orgId: 'org-1' }));
	render(OnboardingKanbanView, { props: { ctx } });
	render(OnboardingModals, { props: { ctx, rankCatalog, rankCatalogUnavailable } });
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
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	onboardingStore.load([], 'reset');
	onboardingTemplateStore.load([], [], 'reset');
	personnelRosterHydration.load([], 'reset');
});

describe('Onboarding retained interactions', () => {
	it('disables Start when no template steps are available', () => {
		onboardingTemplateStore.load(onboardingTemplateStore.templates, [], 'org-1');
		mount();
		expect((screen.getByRole('button', { name: 'Start Onboarding' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('shows inactive paperwork without a stage editor in the detail sheet', async () => {
		onboardingStore.load(
			[
				{
					...packet,
					steps: [
						{
							...packet.steps[0],
							stepName: 'Finance packet',
							stepType: 'paperwork',
							stages: ['Submitted', 'Review', 'Filed'],
							currentStage: 'Review',
							active: false
						}
					]
				}
			],
			'org-1'
		);
		mount();
		await fireEvent.click(screen.getByRole('button', { name: /SGT Smith, Jane/ }));
		expect(await screen.findByText('Finance packet')).toBeTruthy();
		expect(screen.getByText('Removed')).toBeTruthy();
		expect(screen.queryByRole('group', { name: 'Finance packet paperwork stages' })).toBeNull();
	});

	it('keeps a failed start draft in the actual pipeline and retries it without reselection', async () => {
		const created = { ...packet, id: 'packet-2', personnelId: 'person-2' };
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('{}', { status: 503 }))
			.mockResolvedValueOnce(Response.json(created, { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Start Onboarding' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Member' }));
		await fireEvent.click(await screen.findByRole('option', { name: 'CPL Jones, Alex' }));
		const submit = within(screen.getByRole('dialog', { name: 'Start Onboarding' })).getByRole('button', {
			name: 'Start Onboarding'
		});
		await fireEvent.click(submit);
		await screen.findByRole('alert');
		expect(onboardingStore.items).toEqual([packet]);
		expect(screen.getByRole('button', { name: 'Member' }).textContent).toContain('CPL Jones, Alex');
		await fireEvent.click(submit);
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(onboardingStore.getById('packet-2')).toEqual(created);
		expect(fetchMock.mock.calls[1]).toEqual(fetchMock.mock.calls[0]);
	});

	it('shows a failed paperwork save, rolls back, and confirms a retry in the detail sheet', async () => {
		const paperwork = {
			...packet,
			steps: [
				{
					...packet.steps[0],
					stepType: 'paperwork' as const,
					stages: ['Submitted', 'Reviewed', 'Filed'],
					currentStage: 'Submitted'
				}
			]
		};
		onboardingStore.load([paperwork], 'org-1');
		const feedback = vi.spyOn(toastStore, 'error');
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(new Response('{}', { status: 503 }))
				.mockResolvedValueOnce(Response.json({ completed: false, currentStage: 'Reviewed' }))
		);
		mount();
		await fireEvent.click(screen.getByRole('button', { name: /SGT Smith, Jane/ }));
		await fireEvent.click(await screen.findByRole('button', { name: /Reviewed/ }));
		await waitFor(() => expect(feedback).toHaveBeenCalledWith(expect.any(String)));
		expect(onboardingStore.getById('packet-1')).toEqual(paperwork);
		await fireEvent.click(screen.getByRole('button', { name: /Reviewed/ }));
		await waitFor(() => expect(onboardingStore.getById('packet-1')?.steps[0].currentStage).toBe('Reviewed'));
	});

	it('shows Re-sync failure inside its packet detail, excludes another packet, and clears it after retry', async () => {
		onboardingStore.load(
			[
				packet,
				{
					...packet,
					id: 'packet-2',
					personnelId: 'person-2',
					steps: [{ ...packet.steps[0], id: 'step-2', onboardingId: 'packet-2' }]
				}
			],
			'org-1'
		);
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(Response.json({ message: 'Template unavailable' }, { status: 503 }))
				.mockResolvedValueOnce(Response.json({ templateId: packet.templateId, steps: packet.steps }))
		);
		const ctx = mount();
		const resync = vi.spyOn(ctx, 'handleResync');
		await fireEvent.click(screen.getByRole('button', { name: /SGT Smith, Jane/ }));
		const ownDetail = await screen.findByRole('dialog', { name: 'SGT Smith, Jane' });
		await fireEvent.click(within(ownDetail).getByRole('button', { name: 'Re-sync' }));
		await resync.mock.results[0].value;
		await waitFor(() => expect(ctx.resyncError).toBe('Template unavailable'));
		const notice = within(ownDetail).queryByRole('alert');
		expect.soft(notice).not.toBeNull();
		if (notice) expect(notice.textContent).toContain('Template unavailable');
		expect((within(ownDetail).getByRole('button', { name: 'Re-sync' }) as HTMLButtonElement).disabled).toBe(false);
		await fireEvent.click(within(ownDetail).getByRole('button', { name: 'Close' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(screen.getByRole('alert').textContent).toContain('Template unavailable');

		await fireEvent.click(screen.getByRole('button', { name: /CPL Jones, Alex/ }));
		const otherDetail = await screen.findByRole('dialog', { name: 'CPL Jones, Alex' });
		expect(within(otherDetail).queryByRole('alert')).toBeNull();
		await fireEvent.click(within(otherDetail).getByRole('button', { name: 'Close' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		await fireEvent.click(screen.getByRole('button', { name: /SGT Smith, Jane/ }));
		const reopened = await screen.findByRole('dialog', { name: 'SGT Smith, Jane' });
		expect.soft(within(reopened).queryByRole('alert')).not.toBeNull();
		await fireEvent.click(within(reopened).getByRole('button', { name: 'Re-sync' }));
		await resync.mock.results[1].value;
		await waitFor(() => expect(within(reopened).queryByRole('alert')).toBeNull());
		expect(ctx.resyncError).toBeNull();
		expect(onboardingStore.getById(packet.id)).toEqual(packet);
	});

	it('retains the incomplete-step confirmation after a failed completion and retries successfully', async () => {
		const feedback = vi.spyOn(toastStore, 'error');
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(new Response('{}', { status: 503 }))
				.mockResolvedValueOnce(Response.json({ status: 'completed', completedAt: '2026-06-15', cancelledAt: null }))
		);
		mount();
		await fireEvent.click(screen.getByRole('button', { name: /SGT Smith, Jane/ }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Mark Complete' }));
		const confirmation = await screen.findByRole('alertdialog', { name: 'Complete Onboarding' });
		expect(within(confirmation).getByText(/1 step still incomplete/)).toBeTruthy();
		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Mark Complete' }));
		await waitFor(() => expect(feedback).toHaveBeenCalledWith(expect.any(String)));
		expect(screen.getByRole('alertdialog', { name: 'Complete Onboarding' })).toBeTruthy();
		await waitFor(() => expect(confirmation.contains(document.activeElement)).toBe(true));
		expect(onboardingStore.getById('packet-1')).toEqual(packet);
		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Mark Complete' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(onboardingStore.getById('packet-1')).toMatchObject({ status: 'completed', steps: packet.steps });
	});

	it('retains focus in the cancellation confirmation after failure and permits retry', async () => {
		const feedback = vi.spyOn(toastStore, 'error');
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(new Response('{}', { status: 503 }))
				.mockResolvedValueOnce(Response.json({ status: 'cancelled', completedAt: null, cancelledAt: '2026-06-15' }))
		);
		mount();
		await fireEvent.click(screen.getByRole('button', { name: /SGT Smith, Jane/ }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
		const confirmation = await screen.findByRole('alertdialog', { name: 'Cancel Onboarding' });
		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel Onboarding' }));
		await waitFor(() => expect(feedback).toHaveBeenCalledWith(expect.any(String)));
		await waitFor(() => expect(confirmation.contains(document.activeElement)).toBe(true));
		expect(onboardingStore.getById('packet-1')).toEqual(packet);
		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel Onboarding' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(onboardingStore.getById('packet-1')).toMatchObject({ status: 'cancelled', steps: packet.steps });
	});

	it.each(['operate', 'configure'] as const)(
		'offers packet reconciliation only to a scoped %s user when permitted',
		async (access) => {
			personnelRosterHydration.load(
				[
					{
						id: 'person-1',
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jane',
						mos: '',
						clinicRole: '',
						groupId: 'alpha',
						groupName: 'Alpha'
					}
				],
				'org-1'
			);
			const ctx = new OnboardingPageContext(
				new ModalRegistry(),
				createTestOrgContext({
					orgId: 'org-1',
					userRole: 'member',
					capabilityMap: { ...NONE_TEST_CAPABILITY_MAP, onboarding: access },
					scopeSet: { kind: 'groups', groupIds: ['alpha'] }
				})
			);
			render(OnboardingKanbanView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('button', { name: /SGT Smith, Jane/ }));
			expect(await screen.findByRole('button', { name: 'Mark Complete' })).toBeTruthy();
			expect(Boolean(screen.queryByRole('button', { name: 'Re-sync' }))).toBe(access === 'configure');
			expect(Boolean(screen.queryByRole('button', { name: 'Switch Template' }))).toBe(access === 'configure');
			expect(screen.queryByRole('link', { name: 'Templates' })).toBeNull();
		}
	);

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
		expect(await screen.findByRole('button', { name: /VRA Nolan, Avery/ })).toBeTruthy();
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

	it('explains a rank outage, disables Add Person and still starts an existing member', async () => {
		const created: PersonnelOnboarding = { ...packet, id: 'packet-2', personnelId: 'person-2', steps: [] };
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		mount([], true);
		await fireEvent.click(screen.getByRole('button', { name: 'Start Onboarding' }));
		expect((screen.getByRole('button', { name: 'Add Person' }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByRole('alert').textContent).toMatch(/reload/i);
		await fireEvent.click(screen.getByRole('button', { name: 'Member' }));
		await fireEvent.click(await screen.findByRole('option', { name: 'CPL Jones, Alex' }));
		await fireEvent.click(
			within(screen.getByRole('dialog', { name: 'Start Onboarding' })).getByRole('button', { name: 'Start Onboarding' })
		);
		await waitFor(() => expect(onboardingStore.getById('packet-2')).toEqual(created));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			'/org/org-1/api/onboarding',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ personnelId: 'person-2', templateId: 'template-1', startedAt: '2026-06-15' })
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
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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
		let deny!: (response: Response) => void;
		let confirm!: (response: Response) => void;
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						deny = resolve;
					})
			)
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						confirm = resolve;
					})
			);
		vi.stubGlobal('fetch', fetchMock);
		const ctx = mount();
		const toggle = vi.spyOn(ctx, 'handleToggleCheckbox');
		await fireEvent.click(screen.getByRole('button', { name: /SGT Smith, Jane/ }));
		await fireEvent.click(await screen.findByRole('checkbox', { name: 'Mark Verify ID card complete' }));
		await fireEvent.click(await screen.findByRole('button', { name: /^Completed/ }));
		expect(screen.getByRole('checkbox', { name: 'Mark Verify ID card incomplete' }).getAttribute('aria-checked')).toBe(
			'true'
		);
		deny(new Response('{}', { status: 403 }));
		await toggle.mock.results[0].value;
		await waitFor(() =>
			expect(screen.getByRole('checkbox', { name: 'Mark Verify ID card complete' }).getAttribute('aria-checked')).toBe(
				'false'
			)
		);
		expect(onboardingStore.getById('packet-1')).toEqual(packet);
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Verify ID card complete' }));
		expect(screen.getByRole('checkbox', { name: 'Mark Verify ID card incomplete' }).getAttribute('aria-checked')).toBe(
			'true'
		);
		confirm(
			Response.json({
				id: 'step-1',
				onboardingId: 'packet-1',
				stepName: 'Verify ID card',
				stepType: 'checkbox',
				completed: true,
				currentStage: null
			})
		);
		await toggle.mock.results[1].value;
		await waitFor(() =>
			expect(
				screen.getByRole('checkbox', { name: 'Mark Verify ID card incomplete' }).getAttribute('aria-checked')
			).toBe('true')
		);
		expect(onboardingStore.getById('packet-1')).toEqual({
			...packet,
			steps: [{ ...packet.steps[0], completed: true }]
		});
		expect(fetchMock).toHaveBeenLastCalledWith(
			'/org/org-1/api/onboarding-steps',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ action: 'toggleCheckbox', stepId: 'step-1', completed: true })
			})
		);
	});
});
