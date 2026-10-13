// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingActiveView from './OnboardingActiveView.svelte';
import OnboardingModals from './OnboardingModals.svelte';
import { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
import { onboardingStore } from '../stores/onboarding.svelte';
import { onboardingTemplateStore } from '../stores/onboardingTemplate.svelte';
import { personnelRosterHydration } from '$features/personnel';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { OnboardingStepProgress, OnboardingTemplateStep, PersonnelOnboarding } from '../onboarding.types';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn(), invalidateAll: vi.fn() }));

const NOW = '2026-06-15T12:00:00.000Z';
const STAGES = ['Submitted', 'At Finance', 'Signed'];

function templateStep(
	id: string,
	templateId: string,
	sortOrder: number,
	overrides: Partial<OnboardingTemplateStep> = {}
) {
	return {
		id,
		templateId,
		name: id,
		description: null,
		stepType: 'checkbox',
		trainingTypeId: null,
		stages: null,
		sortOrder,
		...overrides
	} satisfies OnboardingTemplateStep;
}

const templateSteps = [
	templateStep('Brief', 'standard', 0),
	templateStep('Finance', 'standard', 1, { stepType: 'paperwork', stages: STAGES }),
	templateStep('SHARP', 'standard', 2, { stepType: 'training', trainingTypeId: 'training-1' }),
	templateStep('Badge', 'reserve', 0)
];

function progress(
	onboardingId: string,
	templateStepId: string,
	overrides: Partial<OnboardingStepProgress> = {}
): OnboardingStepProgress {
	const source = templateSteps.find((candidate) => candidate.id === templateStepId)!;
	return {
		id: `${onboardingId}-${templateStepId}`,
		onboardingId,
		stepName: source.name,
		stepType: source.stepType,
		trainingTypeId: source.trainingTypeId,
		stages: source.stages,
		sortOrder: source.sortOrder,
		completed: false,
		currentStage: null,
		notes: [],
		templateStepId,
		active: true,
		progressChangedAt: NOW,
		...overrides
	};
}

function packet(
	id: string,
	personnelId: string,
	templateId: string | null,
	startedAt: string,
	steps: OnboardingStepProgress[]
): PersonnelOnboarding {
	return {
		id,
		personnelId,
		templateId,
		startedAt,
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		steps
	};
}

function person(id: string, rank: string, lastName: string, firstName: string, mos = '') {
	return { id, rank, lastName, firstName, mos, clinicRole: '', groupId: null, groupName: '' };
}

/** Smith is 14 days stalled at Finance, Jones is on track, Lee is ready, Diaz is on the Reserve template and Park has none. */
const packets = [
	packet('p-smith', 'person-1', 'standard', '2026-06-01', [
		progress('p-smith', 'Brief', { completed: true }),
		progress('p-smith', 'Finance', { currentStage: 'At Finance', progressChangedAt: '2026-06-01T12:00:00.000Z' }),
		progress('p-smith', 'SHARP')
	]),
	packet('p-jones', 'person-2', 'standard', '2026-06-05', [
		progress('p-jones', 'Brief'),
		progress('p-jones', 'Finance', { currentStage: 'Submitted', progressChangedAt: '2026-06-14T12:00:00.000Z' })
	]),
	packet('p-lee', 'person-3', 'standard', '2026-06-10', [
		progress('p-lee', 'Brief', { completed: true }),
		progress('p-lee', 'Finance', { completed: true, currentStage: 'Signed' }),
		progress('p-lee', 'SHARP', { completed: true })
	]),
	packet('p-diaz', 'person-4', 'reserve', '2026-06-12', [progress('p-diaz', 'Badge')]),
	packet('p-park', 'person-5', null, '2026-06-12', [progress('p-park', 'Badge')])
];

function access(capabilityMap = createCapabilityMap('configure'), membershipRole: 'owner' | 'member' = 'owner') {
	return new OnboardingPageContext(new ModalRegistry(), {
		orgId: 'org-1',
		orgUrlSegment: 'org-1',
		...createClientAccess({ membershipRole, capabilityMap })
	});
}

function mount(ctx = access()) {
	render(OnboardingActiveView, { props: { ctx, typicalDaysToFinish: null } });
	render(OnboardingModals, { props: { ctx, rankCatalog: [], rankCatalogUnavailable: false } });
	return ctx;
}

async function showMatrix() {
	await fireEvent.click(screen.getByRole('button', { name: 'Matrix' }));
}

function grid(template: string) {
	return screen.getByRole('table', { name: `${template} packet` });
}

function cell(table: HTMLElement, name: RegExp | string) {
	return within(table).getByRole('button', { name });
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(NOW));
	personnelRosterHydration.load(
		[
			person('person-1', 'SGT', 'Smith', 'Jane'),
			person('person-2', 'CPL', 'Jones', 'Alex'),
			person('person-3', 'SPC', 'Lee', 'Pat', '68W'),
			person('person-4', 'PFC', 'Diaz', 'Sam'),
			person('person-5', 'PV2', 'Park', 'Kim')
		],
		'org-1'
	);
	onboardingTemplateStore.load(
		[
			{ id: 'standard', orgId: 'org-1', name: 'Standard', description: null, createdAt: '2026-06-01' },
			{ id: 'reserve', orgId: 'org-1', name: 'Reserve', description: null, createdAt: '2026-06-02' }
		],
		templateSteps,
		'org-1'
	);
	onboardingStore.load(packets, 'org-1');
});

afterEach(async () => {
	cleanup();
	await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	onboardingStore.load([], 'reset');
	onboardingTemplateStore.load([], [], 'reset');
	personnelRosterHydration.load([], 'reset');
});

describe('Onboarding Matrix view', () => {
	it('opens on the List and switches to the Matrix from the toolbar and from the strip', async () => {
		mount();
		expect(screen.getByRole('list', { name: 'Soldiers in processing' })).toBeTruthy();
		expect(screen.queryByRole('table')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'All 4 steps' }));
		expect(screen.getAllByRole('table')).toHaveLength(2);
		expect(screen.queryByRole('list', { name: 'Soldiers in processing' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Matrix' }).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('heading', { level: 1, name: 'Onboarding' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'List' }));
		expect(screen.getByRole('list', { name: 'Soldiers in processing' })).toBeTruthy();
	});

	it('draws one grid per template, busiest first, with the key beside the first heading only', async () => {
		mount();
		await showMatrix();

		expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent?.trim())).toEqual([
			'Standard packet',
			'Reserve packet'
		]);
		expect(screen.getByText('3 Soldiers × 3 steps · oldest first')).toBeTruthy();
		expect(screen.getByText('1 Soldier × 1 step · oldest first')).toBeTruthy();
		expect(screen.getAllByRole('list', { name: 'Matrix key' })).toHaveLength(1);
		expect(
			within(grid('Standard'))
				.getAllByRole('columnheader')
				.map((header) => header.textContent?.replace(/\s+/g, ' ').trim())
		).toEqual(['Soldier Day', 'Brief check', 'Finance paper', 'SHARP training']);
		expect(
			within(grid('Standard'))
				.getByRole('columnheader', { name: /Finance/ })
				.getAttribute('title')
		).toBe('Finance');
	});

	it('lists Soldiers oldest start first and shows each cell as done, open, a stage or stalled', async () => {
		mount();
		await showMatrix();
		const standard = grid('Standard');

		expect(
			within(standard)
				.getAllByRole('rowheader')
				.map((header) => header.textContent?.replace(/\s+/g, ' ').trim())
		).toEqual(['SGT Smith, Jane 15', 'CPL Jones, Alex 11', 'SPC Lee, Pat All done · Close out 6', 'Open on step']);
		expect(cell(standard, 'SGT Smith, Jane, Brief: done. Select for details')).toBeTruthy();
		expect(
			cell(standard, /SGT Smith, Jane, Finance: At Finance, stage 2 of 3, 14 days, stalled/).textContent
		).toContain('2/3');
		expect(cell(standard, /SGT Smith, Jane, Finance/).textContent).toContain('14d');
		expect(cell(standard, /CPL Jones, Alex, Finance: Submitted, stage 1 of 3, 1 day\./).textContent).not.toContain('d');
		expect(cell(standard, 'CPL Jones, Alex, Brief: open. Select to mark complete')).toBeTruthy();
	});

	it('shows a dash for a step the packet does not have yet and explains it', async () => {
		mount();
		await showMatrix();

		const missing = within(grid('Standard')).getByText('–').closest('td')!;
		expect(missing.getAttribute('title')).toBe('Not on this packet yet. Sync the packet to add it.');
		expect(within(missing).queryByRole('button')).toBeNull();
		expect(missing.textContent).not.toContain('open');
	});

	it('collapses a ready Soldier into one line, and Close out asks the same confirmation as the List', async () => {
		mount();
		await showMatrix();
		const standard = grid('Standard');

		expect(within(standard).getByText('All 3 steps done')).toBeTruthy();
		await fireEvent.click(within(standard).getByRole('button', { name: 'Close out SPC Lee, Pat' }));

		const confirmation = await screen.findByRole('alertdialog', { name: 'Complete Onboarding' });
		expect(within(confirmation).getByText('Mark this onboarding as complete?')).toBeTruthy();
	});

	it('counts the Soldiers open on each step and the stalled ones in the footer', async () => {
		mount();
		await showMatrix();
		const standard = grid('Standard');
		const footer = within(standard).getByRole('row', { name: /Open on step/ });

		expect(
			within(footer)
				.getAllByRole('cell')
				.map((counted) => counted.textContent?.replace(/\s+/g, ' ').trim())
		).toEqual(['Brief: 1 open 1', 'Finance: 2 open, 1 stalled 2 1 stalled', 'SHARP: 1 open 1']);
	});

	it('names the Soldiers with no template and the way to give them one', async () => {
		mount();
		await showMatrix();

		expect(screen.getByText('1 packet has no template. Open it in List view to assign one.')).toBeTruthy();
		expect(screen.queryByText('PV2 Park, Kim')).toBeNull();
	});

	it('applies the search and Group filter to the grids and keeps the header and toolbar', async () => {
		mount();
		await showMatrix();

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: 'diaz' }
		});

		expect(screen.queryByRole('table', { name: 'Standard packet' })).toBeNull();
		expect(within(grid('Reserve')).getByText('PFC Diaz, Sam')).toBeTruthy();
		expect(screen.queryByText(/have no template|has no template/)).toBeNull();
		expect(screen.getByRole('button', { name: 'Matrix' })).toBeTruthy();

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: 'nobody' }
		});
		expect(screen.getByText('No Soldiers match')).toBeTruthy();
		expect(screen.queryByRole('table')).toBeNull();
	});
});

describe('Onboarding Matrix cells', () => {
	it('checks an open checkbox step in place and shows it done', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(Response.json({ completed: true, currentStage: null, progressChangedAt: NOW }));
		vi.stubGlobal('fetch', fetchMock);
		mount();
		await showMatrix();

		await fireEvent.click(cell(grid('Standard'), 'CPL Jones, Alex, Brief: open. Select to mark complete'));

		await waitFor(() => expect(onboardingStore.getById('p-jones')?.steps[0].completed).toBe(true));
		expect(fetchMock).toHaveBeenCalledWith(
			'/org/org-1/api/onboarding-steps',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ action: 'toggleCheckbox', stepId: 'p-jones-Brief', completed: true })
			})
		);
		expect(cell(grid('Standard'), 'CPL Jones, Alex, Brief: done. Select for details')).toBeTruthy();
	});

	it('rolls a refused check back to an open box', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
		mount();
		await showMatrix();

		await fireEvent.click(cell(grid('Standard'), 'CPL Jones, Alex, Brief: open. Select to mark complete'));

		await waitFor(() =>
			expect(cell(grid('Standard'), 'CPL Jones, Alex, Brief: open. Select to mark complete')).toBeTruthy()
		);
		expect(onboardingStore.getById('p-jones')?.steps[0].completed).toBe(false);
	});

	it('opens a paperwork cell with its stage, how long it has waited and the stage controls', async () => {
		mount();
		await showMatrix();

		await fireEvent.click(cell(grid('Standard'), /SGT Smith, Jane, Finance/));

		const popover = await screen.findByRole('dialog', { name: 'SGT Smith, Jane: Finance' });
		expect(within(popover).getByText('At Finance for 14 days')).toBeTruthy();
		expect(within(popover).getByText('Smith · Finance')).toBeTruthy();
		expect(within(popover).getByRole('button', { name: 'Advance Finance to Signed' })).toBeTruthy();
	});

	it('advances a stalled step from the popover and clears the stall at once', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(Response.json({ completed: true, currentStage: 'Signed', progressChangedAt: NOW }));
		vi.stubGlobal('fetch', fetchMock);
		mount();
		await showMatrix();
		await fireEvent.click(cell(grid('Standard'), /SGT Smith, Jane, Finance/));
		const popover = await screen.findByRole('dialog', { name: 'SGT Smith, Jane: Finance' });

		await fireEvent.click(within(popover).getByRole('button', { name: 'Advance Finance to Signed' }));

		await waitFor(() => expect(onboardingStore.getById('p-smith')?.steps[1].completed).toBe(true));
		expect(fetchMock).toHaveBeenCalledWith(
			'/org/org-1/api/onboarding-steps',
			expect.objectContaining({
				body: JSON.stringify({ action: 'advanceStage', stepId: 'p-smith-Finance', stageName: 'Signed' })
			})
		);
		expect(within(grid('Standard')).getByRole('row', { name: /Open on step/ }).textContent).not.toContain('stalled');
	});

	it('closes the popover on Escape and puts focus back on its cell', async () => {
		mount();
		await showMatrix();
		const trigger = cell(grid('Standard'), /SGT Smith, Jane, Finance/);
		trigger.focus();
		await fireEvent.click(trigger);
		await screen.findByRole('dialog', { name: 'SGT Smith, Jane: Finance' });

		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(cell(grid('Standard'), /SGT Smith, Jane, Finance/)));
	});

	it('offers Record training from a training cell to a member who can open Training', async () => {
		mount();
		await showMatrix();

		await fireEvent.click(cell(grid('Standard'), 'SGT Smith, Jane, SHARP: open. Select for details'));

		const popover = await screen.findByRole('dialog', { name: 'SGT Smith, Jane: SHARP' });
		expect(within(popover).getByText('Waiting on training record')).toBeTruthy();
		expect(within(popover).getByRole('link', { name: 'Record training' }).getAttribute('href')).toBe(
			'/org/org-1/training'
		);
	});

	it('lets a done checkbox be reopened from its popover', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ completed: false, currentStage: null, progressChangedAt: NOW }))
		);
		mount();
		await showMatrix();
		await fireEvent.click(cell(grid('Standard'), 'SGT Smith, Jane, Brief: done. Select for details'));
		const popover = await screen.findByRole('dialog', { name: 'SGT Smith, Jane: Brief' });

		await fireEvent.click(within(popover).getByRole('button', { name: 'Mark Brief incomplete' }));

		await waitFor(() => expect(onboardingStore.getById('p-smith')?.steps[0].completed).toBe(false));
		expect(within(popover).getByText('Open')).toBeTruthy();
	});

	it('shows the latest note in the popover and adds another there', async () => {
		const older = { text: 'Packet returned', timestamp: '2026-06-10T12:00:00.000Z', userId: 'user-1' };
		const latest = {
			text: 'Finance needs a re-signed DA 5960',
			timestamp: '2026-06-12T12:00:00.000Z',
			userId: 'user-1'
		};
		const added = { text: 'Called Finance', timestamp: NOW, userId: 'user-1' };
		onboardingStore.load(
			packets.map((candidate) =>
				candidate.id === 'p-smith'
					? {
							...candidate,
							steps: candidate.steps.map((s) => (s.stepName === 'Finance' ? { ...s, notes: [older, latest] } : s))
						}
					: candidate
			),
			'org-1'
		);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ id: 'p-smith-Finance', notes: [older, latest, added] }))
		);
		mount();
		await showMatrix();
		await fireEvent.click(cell(grid('Standard'), /SGT Smith, Jane, Finance/));
		const popover = await screen.findByRole('dialog', { name: 'SGT Smith, Jane: Finance' });

		const notes = within(popover).getByRole('list', { name: 'Finance notes' });
		expect(within(notes).getAllByRole('listitem')).toHaveLength(1);
		expect(within(notes).getByText('Finance needs a re-signed DA 5960')).toBeTruthy();

		await fireEvent.click(within(popover).getByRole('button', { name: 'Add note' }));
		await fireEvent.input(within(popover).getByRole('textbox', { name: 'Note for Finance' }), {
			target: { value: 'Called Finance' }
		});
		await fireEvent.click(within(popover).getByRole('button', { name: 'Save note' }));

		await waitFor(() => expect(within(popover).getByText('Called Finance')).toBeTruthy());
		expect(within(popover).queryByText('Finance needs a re-signed DA 5960')).toBeNull();
	});
});

describe('Onboarding Matrix late responses', () => {
	it('leaves another cell popover open when an earlier note save finishes', async () => {
		let finish!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve))));
		mount();
		await showMatrix();
		await fireEvent.click(cell(grid('Standard'), /SGT Smith, Jane, Finance/));
		const first = await screen.findByRole('dialog', { name: 'SGT Smith, Jane: Finance' });
		await fireEvent.click(within(first).getByRole('button', { name: 'Add note' }));
		await fireEvent.input(within(first).getByRole('textbox', { name: 'Note for Finance' }), {
			target: { value: 'First' }
		});
		await fireEvent.click(within(first).getByRole('button', { name: 'Save note' }));

		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		await fireEvent.click(cell(grid('Standard'), /CPL Jones, Alex, Finance/));
		const second = await screen.findByRole('dialog', { name: 'CPL Jones, Alex: Finance' });
		await fireEvent.click(within(second).getByRole('button', { name: 'Add note' }));
		await fireEvent.input(within(second).getByRole('textbox', { name: 'Note for Finance' }), {
			target: { value: 'Second' }
		});

		finish(Response.json({ id: 'p-smith-Finance', notes: [{ text: 'First', timestamp: NOW, userId: 'user-1' }] }));
		await waitFor(() => expect(onboardingStore.getById('p-smith')?.steps[1].notes).toHaveLength(1));

		expect(screen.getByRole('dialog', { name: 'CPL Jones, Alex: Finance' })).toBeTruthy();
		expect((within(second).getByRole('textbox', { name: 'Note for Finance' }) as HTMLTextAreaElement).value).toBe(
			'Second'
		);
	});

	it('keeps a popover open on its own cell when a stage save finishes after the user moved on', async () => {
		let finish!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve))));
		mount();
		await showMatrix();
		await fireEvent.click(cell(grid('Standard'), /SGT Smith, Jane, Finance/));
		const first = await screen.findByRole('dialog', { name: 'SGT Smith, Jane: Finance' });
		await fireEvent.click(within(first).getByRole('button', { name: 'Advance Finance to Signed' }));

		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		await fireEvent.click(cell(grid('Standard'), /CPL Jones, Alex, Finance/));
		await screen.findByRole('dialog', { name: 'CPL Jones, Alex: Finance' });

		finish(Response.json({ completed: true, currentStage: 'Signed', progressChangedAt: NOW }));
		await waitFor(() => expect(onboardingStore.getById('p-smith')?.steps[1].completed).toBe(true));

		expect(screen.getByRole('dialog', { name: 'CPL Jones, Alex: Finance' })).toBeTruthy();
	});

	it('does not let a late check overwrite a newer uncheck of the same step', async () => {
		let finishCheck!: (response: Response) => void;
		const fetchMock = vi
			.fn()
			.mockReturnValueOnce(new Promise<Response>((resolve) => (finishCheck = resolve)))
			.mockResolvedValueOnce(Response.json({ completed: false, currentStage: null, progressChangedAt: NOW }));
		vi.stubGlobal('fetch', fetchMock);
		mount();
		await showMatrix();

		await fireEvent.click(cell(grid('Standard'), 'CPL Jones, Alex, Brief: open. Select to mark complete'));
		await fireEvent.click(cell(grid('Standard'), 'CPL Jones, Alex, Brief: done. Select for details'));
		const popover = await screen.findByRole('dialog', { name: 'CPL Jones, Alex: Brief' });
		await fireEvent.click(within(popover).getByRole('button', { name: 'Mark Brief incomplete' }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(onboardingStore.getById('p-jones')?.steps[0].completed).toBe(false));

		finishCheck(Response.json({ completed: true, currentStage: null, progressChangedAt: NOW }));
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(onboardingStore.getById('p-jones')?.steps[0].completed).toBe(false);
		expect(cell(grid('Standard'), 'CPL Jones, Alex, Brief: open. Select to mark complete')).toBeTruthy();
	});

	it('cannot cancel or dismiss the Close out confirmation while its save is pending', async () => {
		let finish!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve))));
		mount();
		await showMatrix();
		await fireEvent.click(within(grid('Standard')).getByRole('button', { name: 'Close out SPC Lee, Pat' }));
		const confirmation = await screen.findByRole('alertdialog', { name: 'Complete Onboarding' });

		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Mark Complete' }));

		await waitFor(() =>
			expect((within(confirmation).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
		);
		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		expect(screen.getByRole('alertdialog', { name: 'Complete Onboarding' })).toBeTruthy();

		finish(Response.json({ status: 'completed', completedAt: '2026-06-15', cancelledAt: null }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(onboardingStore.getById('p-lee')?.status).toBe('completed');
		expect(within(grid('Standard')).queryByText('SPC Lee, Pat')).toBeNull();
	});

	it('closes the popover when its Soldier leaves the Matrix', async () => {
		mount();
		await showMatrix();
		await fireEvent.click(cell(grid('Standard'), /SGT Smith, Jane, Finance/));
		await screen.findByRole('dialog', { name: 'SGT Smith, Jane: Finance' });

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: 'jones' }
		});
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: '' }
		});

		expect(screen.queryByRole('dialog')).toBeNull();
	});
});

describe('Onboarding Matrix without manage access', () => {
	it('shows read-only cells and says why instead of offering actions', async () => {
		mount(access(createCapabilityMap('view'), 'member'));
		await showMatrix();
		const standard = grid('Standard');

		expect(screen.getByText(/View only\. You can't change onboarding steps/)).toBeTruthy();
		expect(within(standard).queryAllByRole('button')).toEqual([]);
		const readOnly = within(standard).getByLabelText('CPL Jones, Alex, Brief: open. Read only').closest('td')!;
		expect(readOnly.getAttribute('title')).toBe("Read only. You can't manage onboarding for this Soldier.");
		expect(within(standard).getByText('All 3 steps done')).toBeTruthy();
		expect(within(standard).queryByText('All done · Close out')).toBeNull();
	});
});
