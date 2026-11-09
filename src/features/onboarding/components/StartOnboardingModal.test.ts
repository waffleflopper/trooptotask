// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelOnboarding } from '../onboarding.types';
import type { OnboardingTemplate } from '../onboarding.types';
import type { StartOnboardingOutcome } from '../contracts';
import { onboardingStore } from '../stores/onboarding.svelte';
import StartOnboardingModal from './StartOnboardingModal.svelte';

const person = (id: string, lastName: string, firstName: string) =>
	({
		id,
		rank: 'SGT',
		lastName,
		firstName,
		mos: '68W',
		clinicRole: 'Medic',
		groupId: null,
		groupName: ''
	}) as Personnel;
const personnel = [
	person('person-1', 'Smith', 'Jane'),
	person('person-2', 'Jones', 'Al'),
	person('person-3', 'Young', 'Bo')
];

const template = (id: string, name: string, isDefault = false): OnboardingTemplate => ({
	id,
	orgId: 'org-1',
	name,
	description: null,
	createdAt: '2026-03-01',
	isDefault
});
const standard = template('template-1', 'Standard Inprocessing');

const packet = (personnelId: string): PersonnelOnboarding => ({
	id: `packet-${personnelId}`,
	personnelId,
	templateId: 'template-1',
	status: 'in_progress',
	startedAt: '2026-03-15',
	completedAt: null,
	cancelledAt: null,
	steps: []
});
const started = (personnelId: string): StartOnboardingOutcome => ({
	personnelId,
	outcome: 'started',
	onboarding: packet(personnelId)
});

function renderModal(overrides: Record<string, unknown> = {}) {
	const props = {
		personnel,
		canAddPerson: false,
		existingOnboardingPersonnelIds: [] as string[],
		groups: [],
		rankCatalogUnavailable: false,
		rankCatalog: [],
		templates: [standard],
		onSubmit: vi.fn(),
		onAddPerson: vi.fn(),
		onClose: vi.fn(),
		...overrides
	};
	return { ...render(StartOnboardingModal, { props }), props };
}

async function choose(...names: string[]) {
	await fireEvent.focus(screen.getByRole('combobox', { name: 'Members' }));
	for (const name of names) {
		const listbox = await screen.findByRole('listbox');
		await fireEvent.click(within(listbox).getByRole('option', { name: new RegExp(name) }));
	}
	await fireEvent.keyDown(screen.getByRole('combobox', { name: 'Members' }), { key: 'Escape' });
}
const startButton = (name: string | RegExp = /Start onboarding/i) => screen.getByRole('button', { name });

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('StartOnboardingModal', () => {
	it('offers existing members without an Add Person action when Personnel create is denied', () => {
		renderModal();

		expect(screen.getByRole('combobox', { name: 'Members' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Add Person' })).toBeNull();
	});

	it('renders as an accessible app dialog and preserves the disabled template-required state', () => {
		renderModal({ canAddPerson: true, hasTemplateSteps: false });

		expect(screen.getByRole('dialog', { name: 'Start Onboarding' })).toBeTruthy();
		expect(screen.getByText('Template Required')).toBeTruthy();
		expect((startButton('Start Onboarding') as HTMLButtonElement).disabled).toBe(true);
	});

	it('submits the chosen members, start date and template, and closes only after the save is confirmed', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
		let confirm!: (outcomes: StartOnboardingOutcome[]) => void;
		const onSubmit = vi.fn(() => new Promise<StartOnboardingOutcome[]>((resolve) => (confirm = resolve)));
		const { props } = renderModal({ onSubmit });

		await choose('Smith', 'Young');
		await fireEvent.click(startButton());

		expect(props.onClose).not.toHaveBeenCalled();
		expect((startButton() as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(startButton());
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith(['person-1', 'person-3'], '2026-03-15', 'template-1');
		confirm([started('person-1'), started('person-3')]);

		await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
	});

	describe('template choice', () => {
		it('preselects the Organization default among several templates', () => {
			renderModal({
				templates: [template('a', 'Alpha'), template('b', 'Bravo', true), template('c', 'Charlie')]
			});

			expect(screen.getByRole('button', { name: 'Template' }).textContent).toContain('Bravo (default)');
		});

		it('shows the only template, selected, instead of hiding the picker', () => {
			renderModal();

			expect(screen.getByRole('button', { name: 'Template' }).textContent).toContain('Standard Inprocessing');
		});

		it('makes the operator choose when several templates have no default', async () => {
			const onSubmit = vi.fn().mockResolvedValue([started('person-1')]);
			renderModal({ onSubmit, templates: [template('a', 'Alpha'), template('b', 'Bravo')] });
			await choose('Smith');

			expect(screen.getByRole('button', { name: 'Template' }).textContent).not.toContain('Alpha');
			expect((startButton() as HTMLButtonElement).disabled).toBe(true);

			await fireEvent.keyDown(screen.getByRole('button', { name: 'Template' }), { key: 'ArrowDown' });
			const bravo = await screen.findByRole('option', { name: 'Bravo' });
			await fireEvent.pointerDown(bravo);
			await fireEvent.pointerUp(bravo);
			expect((startButton() as HTMLButtonElement).disabled).toBe(false);
			await fireEvent.click(startButton());

			await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(['person-1'], expect.any(String), 'b'));
		});
	});

	it('names people who are already onboarding in the picker and does not let them be chosen', async () => {
		renderModal({ existingOnboardingPersonnelIds: ['person-2'] });

		await fireEvent.focus(screen.getByRole('combobox', { name: 'Members' }));
		const listbox = await screen.findByRole('listbox');
		const already = within(listbox).getByRole('option', { name: /Jones, Al/ });

		expect(already.textContent).toContain('Already onboarding');
		expect(already.getAttribute('aria-disabled')).toBe('true');
		await fireEvent.click(already);
		expect(screen.queryByRole('button', { name: /^Remove SGT Jones/ })).toBeNull();
	});

	it('keeps the dialog open after a partial start, lists each outcome, and keeps only the failed person selected', async () => {
		const onSubmit = vi
			.fn<() => Promise<StartOnboardingOutcome[]>>()
			.mockResolvedValueOnce([
				started('person-1'),
				{ personnelId: 'person-2', outcome: 'already_onboarding' },
				{ personnelId: 'person-3', outcome: 'failed', message: 'Template unavailable' }
			])
			.mockResolvedValueOnce([started('person-3')]);
		const { props } = renderModal({ onSubmit });
		await choose('Smith', 'Jones', 'Young');
		await fireEvent.click(startButton());

		const list = await screen.findByRole('list', { name: 'Start results' });
		const rows = within(list)
			.getAllByRole('listitem')
			.map((row) => row.textContent?.replace(/\s+/g, ' ').trim());
		expect(rows).toEqual([
			'SGT Smith, Jane Started',
			'SGT Jones, Al Already onboarding',
			'SGT Young, Bo Not started Template unavailable'
		]);
		expect(props.onClose).not.toHaveBeenCalled();
		expect(screen.queryByRole('button', { name: 'Remove SGT Smith, Jane' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Remove SGT Young, Bo' })).toBeTruthy();

		await fireEvent.click(startButton());

		await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
		expect(onSubmit).toHaveBeenLastCalledWith(['person-3'], expect.any(String), 'template-1');
	});

	it('adds a newly created Person to the selection', async () => {
		const onAddPerson = vi.fn().mockResolvedValue('person-3');
		const onSubmit = vi.fn().mockResolvedValue([started('person-1'), started('person-3')]);
		renderModal({
			canAddPerson: true,
			onAddPerson,
			onSubmit,
			rankCatalog: [
				{
					code: 'SPC',
					label: 'Specialist',
					service: 'army',
					category: 'enlisted',
					payGrade: 'E-4',
					state: 'active',
					sortOrder: 0
				}
			]
		});
		await choose('Smith');

		await fireEvent.click(screen.getByRole('button', { name: 'Add Person' }));
		await fireEvent.input(await screen.findByLabelText(/Last Name/i), { target: { value: 'Young' } });
		await fireEvent.input(screen.getByLabelText(/First Name/i), { target: { value: 'Bo' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Remove SGT Young, Bo' })).toBeTruthy());

		await fireEvent.click(startButton());

		await waitFor(() =>
			expect(onSubmit).toHaveBeenCalledWith(['person-1', 'person-3'], expect.any(String), 'template-1')
		);
	});

	it('stops at the most people one request may name', async () => {
		const many = Array.from({ length: 101 }, (_, index) =>
			person(`p-${index}`, `Last${String(index).padStart(3, '0')}`, 'A')
		);
		renderModal({ personnel: many });
		await fireEvent.focus(screen.getByRole('combobox', { name: 'Members' }));
		const listbox = await screen.findByRole('listbox');
		for (const member of many) {
			const label = `SGT ${member.lastName}, A`;
			const option = [...listbox.querySelectorAll('[role="option"]')].find((row) => row.textContent?.includes(label));
			await fireEvent.click(option!);
		}

		expect((startButton() as HTMLButtonElement).disabled).toBe(true);
	}, 15_000);

	it.each([
		[400, 'Choose at least one Person to onboard'],
		[500, 'Internal server error']
	])('keeps the dialog open and shows the reason for a %i', async (status, serverMessage) => {
		onboardingStore.load([], 'org-1');
		vi.stubGlobal('fetch', async () => Response.json({ message: serverMessage }, { status }));
		const { props } = renderModal({
			onSubmit: async (personnelIds: string[], startedAt: string, templateId: string) =>
				onboardingStore.startOnboarding(personnelIds, startedAt, templateId)
		});
		await choose('Smith');
		await fireEvent.click(startButton());

		const alert = await screen.findByRole('alert');
		if (status === 400) expect(alert.textContent).toContain(serverMessage);
		else {
			expect(alert.textContent).toMatch(/\S/);
			expect(alert.textContent).not.toContain(serverMessage);
		}
		expect(props.onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Remove SGT Smith, Jane' })).toBeTruthy();
		expect(onboardingStore.items).toEqual([]);
	});

	it('says so when the request no longer applies and keeps the selection', async () => {
		const { props } = renderModal({ onSubmit: vi.fn().mockResolvedValue(null) });
		await choose('Smith');
		await fireEvent.click(startButton());

		expect((await screen.findByRole('alert')).textContent).toMatch(/\S/);
		expect(props.onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Remove SGT Smith, Jane' })).toBeTruthy();
	});

	it('does not close a replacement dialog when a dismissed submission later succeeds', async () => {
		let confirm!: (outcomes: StartOnboardingOutcome[]) => void;
		const onSubmit = vi.fn(() => new Promise<StartOnboardingOutcome[]>((resolve) => (confirm = resolve)));
		const onClose = vi.fn();
		const props = {
			personnel,
			canAddPerson: false,
			existingOnboardingPersonnelIds: [],
			groups: [],
			rankCatalogUnavailable: false,
			rankCatalog: [],
			templates: [standard],
			onSubmit,
			onAddPerson: vi.fn(),
			onClose
		};
		const first = render(StartOnboardingModal, { props });
		await choose('Smith');
		await fireEvent.click(startButton());
		first.unmount();
		render(StartOnboardingModal, { props });
		confirm([started('person-1')]);
		await onSubmit.mock.results[0].value;
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog', { name: 'Start Onboarding' })).toBeTruthy();
	});

	it('keeps focus in the dialog while a held submission disables Start and still closes', async () => {
		const onSubmit = vi.fn(() => new Promise<StartOnboardingOutcome[]>(() => {}));
		const { props } = renderModal({ onSubmit });
		const dialog = screen.getByRole('dialog', { name: 'Start Onboarding' });
		await choose('Smith');
		const start = startButton() as HTMLButtonElement;
		start.focus();

		await fireEvent.click(start);

		expect(start.disabled).toBe(true);
		await waitFor(() => expect(document.activeElement).toBe(dialog));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(props.onClose).toHaveBeenCalledTimes(1);
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(props.onClose).toHaveBeenCalledTimes(2);
	});

	it('uses the local calendar date for the default start date', async () => {
		const originalTimezone = process.env.TZ;
		process.env.TZ = 'America/Anchorage';
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date('2026-05-05T02:00:00.000Z'));
		const onSubmit = vi.fn().mockResolvedValue([started('person-1')]);

		try {
			renderModal({ onSubmit });
			await choose('Smith');
			await fireEvent.click(startButton());

			await waitFor(() => {
				expect(onSubmit).toHaveBeenCalledWith(['person-1'], '2026-05-04', 'template-1');
			});
		} finally {
			vi.useRealTimers();
			if (originalTimezone === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTimezone;
			}
		}
	});
});
