import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingActiveView from './OnboardingActiveView.svelte';
import OnboardingModals from './OnboardingModals.svelte';
import { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
import { noteAuthorLookup } from '../onboardingNoteAuthors';
import { onboardingStore } from '../stores/onboarding.svelte';
import { onboardingTemplateStore } from '../stores/onboardingTemplate.svelte';
import { personnelRosterHydration } from '$features/personnel';
import { toastStore } from '$lib/stores/toast.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { OnboardingStepProgress, PersonnelOnboarding } from '../onboarding.types';
import type { RankCatalogEntry } from '$features/personnel/contracts';

const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/org/org-1/onboarding'), state: {} }));

vi.mock('$app/state', () => ({ page: pageState }));
vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: vi.fn(),
	invalidateAll: vi.fn(),
	replaceState: (url: URL) => {
		pageState.url = new URL(url);
	}
}));

const NOW = '2026-06-15T12:00:00.000Z';

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
			active: true,
			progressChangedAt: '2026-06-15T12:00:00.000Z'
		}
	]
};

function step(onboardingId: string, overrides: Partial<OnboardingStepProgress>): OnboardingStepProgress {
	return { ...packet.steps[0], onboardingId, ...overrides };
}

function finance(onboardingId: string, overrides: Partial<OnboardingStepProgress> = {}): OnboardingStepProgress {
	return step(onboardingId, {
		id: `${onboardingId}-finance`,
		templateStepId: null,
		stepName: 'Finance',
		stepType: 'paperwork',
		stages: ['Submitted', 'At Finance', 'Signed', 'Confirmed'],
		currentStage: 'At Finance',
		sortOrder: 1,
		...overrides
	});
}

function person(id: string, rank: string, lastName: string, firstName: string, mos = '') {
	return { id, rank, lastName, firstName, mos, clinicRole: '', groupId: null, groupName: '' };
}

function access(
	capabilityMap = createCapabilityMap('configure'),
	membershipRole: 'owner' | 'member' = 'owner',
	noteAuthorName?: ConstructorParameters<typeof OnboardingPageContext>[2]
) {
	return new OnboardingPageContext(
		new ModalRegistry(),
		{
			orgId: 'org-1',
			orgUrlSegment: 'org-1',
			...createClientAccess({ membershipRole, capabilityMap })
		},
		noteAuthorName
	);
}

function mount(rankCatalog: RankCatalogEntry[] = [], rankCatalogUnavailable = false, ctx = access()) {
	render(OnboardingActiveView, { props: { ctx, typicalDaysToFinish: null } });
	render(OnboardingModals, { props: { ctx, rankCatalog, rankCatalogUnavailable } });
	return ctx;
}

function subtitleText() {
	return document.querySelector('[data-slot="page-header-subtitle"]')?.textContent?.replace(/\s+/g, ' ').trim();
}

function rows() {
	return within(screen.getByRole('list', { name: 'Soldiers in processing' })).getAllByRole('button');
}

async function openPacket(name: string) {
	await fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
	return screen.findByRole('dialog', { name });
}

async function closePacket(dialog: HTMLElement) {
	await fireEvent.click(within(dialog).getByRole('button', { name: 'Close packet' }));
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

async function openMenu(dialog: HTMLElement) {
	await fireEvent.click(within(dialog).getByRole('button', { name: 'More packet actions' }));
	return screen.findByRole('menu');
}

async function chooseMenuItem(dialog: HTMLElement, item: string) {
	const menu = await openMenu(dialog);
	await fireEvent.click(within(menu).getByRole('menuitem', { name: item }));
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(NOW));
	personnelRosterHydration.load(
		[
			person('person-1', 'SGT', 'Smith', 'Jane'),
			person('person-2', 'CPL', 'Jones', 'Alex'),
			person('person-3', 'SPC', 'Lee', 'Pat', '68W'),
			person('person-4', 'PFC', 'Diaz', 'Sam')
		],
		'org-1'
	);
	onboardingTemplateStore.load(
		[
			{ id: 'template-1', orgId: 'org-1', name: 'Inprocessing', description: null, createdAt: '2026-06-01' },
			{ id: 'template-2', orgId: 'org-1', name: 'Reserve inprocessing', description: null, createdAt: '2026-06-02' }
		],
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

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	onboardingStore.load([], 'reset');
	onboardingTemplateStore.load([], [], 'reset');
	personnelRosterHydration.load([], 'reset');
	pageState.url = new URL('http://localhost/org/org-1/onboarding');
});

describe('Onboarding Active list', () => {
	const stalled: PersonnelOnboarding = {
		...packet,
		id: 'packet-2',
		personnelId: 'person-2',
		startedAt: '2026-06-01',
		steps: [
			step('packet-2', { id: 'packet-2-id', completed: true }),
			finance('packet-2', { templateStepId: 'template-1-finance', progressChangedAt: '2026-06-08T12:00:00.000Z' })
		]
	};
	const ready: PersonnelOnboarding = {
		...packet,
		id: 'packet-3',
		personnelId: 'person-3',
		startedAt: '2026-06-10',
		steps: [step('packet-3', { id: 'packet-3-id', completed: true })]
	};
	const onTrack: PersonnelOnboarding = {
		...packet,
		id: 'packet-4',
		personnelId: 'person-4',
		templateId: 'template-2',
		startedAt: '2026-06-05',
		steps: [
			step('packet-4', { id: 'packet-4-id', completed: true }),
			finance('packet-4', { templateStepId: 'template-2-finance', progressChangedAt: '2026-06-09T12:00:00.000Z' })
		]
	};

	beforeEach(() => onboardingStore.load([packet, onTrack, ready, stalled], 'org-1'));

	it('does not render its own main landmark inside the app shell', () => {
		mount();
		expect(screen.queryByRole('main')).toBeNull();
	});

	it('lists Soldiers stalled first, then ready, on track and new, and counts them in the header', () => {
		mount();

		expect(rows().map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Stalled CPL Jones, Alex Finance At Finance · 7 days 1 of 2 Day 15',
			'Ready SPC Lee, Pat 68W All steps done Close out to finish 1 of 1 Day 6',
			'On track PFC Diaz, Sam Finance At Finance · 6 days 1 of 2 Day 11',
			'New SGT Smith, Jane Verify ID card Started today 0 of 1 Day 1'
		]);
		expect(subtitleText()).toBe('4 Soldiers in processing · 1 stalled');
	});

	it('omits the stalled count when no packet is stalled', () => {
		onboardingStore.load([packet, ready], 'org-1');
		mount();
		expect(subtitleText()).toBe('2 Soldiers in processing');
		expect(screen.queryByText('1 stalled', { selector: '[data-slot="page-header"] span' })).toBeNull();
	});

	it('shows a start date in the future as a countdown in the row and the packet', async () => {
		onboardingStore.load(
			[
				{ ...packet, startedAt: '2026-06-18' },
				{ ...onTrack, startedAt: '2026-06-16' }
			],
			'org-1'
		);
		mount();

		expect(rows().map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'On track PFC Diaz, Sam Finance At Finance · 6 days 1 of 2 Starts tomorrow',
			'New SGT Smith, Jane Verify ID card 0 of 1 Starts in 3 days'
		]);
		const dialog = await openPacket('SGT Smith, Jane');
		expect(within(dialog).getByText('Starts in 3 days (Jun 18, 2026)')).toBeTruthy();
	});

	it('counts a step name once across packets from two templates in the waiting strip', () => {
		mount();

		const strip = screen.getByRole('region', { name: 'Where people are waiting' });
		expect(
			within(strip)
				.getAllByRole('listitem')
				.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())
		).toEqual(['2 Finance 1 stalled', '1 Verify ID card Checkbox']);
	});

	it('filters by name, rank or MOS and offers Clear filters when nobody matches', async () => {
		mount();
		const search = screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' });

		await fireEvent.input(search, { target: { value: '68w' } });
		expect(rows().map((row) => row.textContent)).toEqual([expect.stringContaining('SPC Lee, Pat')]);
		expect(screen.getByRole('region', { name: 'Where people are waiting' }).textContent).not.toContain('Finance');

		await fireEvent.input(search, { target: { value: 'Nobody' } });
		expect(screen.getByText('No Soldiers match')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
		expect(rows()).toHaveLength(4);
	});

	it('marks the selected row current and opens that packet', async () => {
		mount();
		const row = screen.getByRole('button', { name: /CPL Jones, Alex/ });

		const dialog = await openPacket('CPL Jones, Alex');

		expect(row.getAttribute('aria-current')).toBe('true');
		expect(within(dialog).getByText('Packet · Inprocessing')).toBeTruthy();
		expect(within(dialog).getByRole('img', { name: '1 of 2 steps done' })).toBeTruthy();
		expect(within(dialog).getByText('1 stalled')).toBeTruthy();
		expect(within(dialog).getByRole('button', { name: 'Close out · 1 open' })).toBeTruthy();
	});

	it('opens the packet a Dashboard row links to at its waiting step, once', async () => {
		pageState.url = new URL('http://localhost/org/org-1/onboarding?packet=packet-2');
		mount();

		const dialog = await screen.findByRole('dialog', { name: 'CPL Jones, Alex' });
		expect(within(dialog).getByRole('heading', { level: 4, name: 'Finance' })).toBeTruthy();
		expect(screen.getByRole('button', { name: /CPL Jones, Alex/ }).getAttribute('aria-current')).toBe('true');
		expect(pageState.url.search).toBe('');

		await closePacket(dialog);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('opens no packet for a link to one that is no longer in processing', async () => {
		pageState.url = new URL('http://localhost/org/org-1/onboarding?packet=packet-gone');
		mount();
		await tick();

		expect(screen.queryByRole('dialog')).toBeNull();
		expect(pageState.url.search).toBe('');
	});

	it('returns focus to the row when the packet closes', async () => {
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /SGT Smith, Jane/ })));
	});

	it('clears the stall flag when Advance saves the next stage', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(Response.json({ completed: false, currentStage: 'Signed', progressChangedAt: NOW }));
		vi.stubGlobal('fetch', fetchMock);
		mount();
		const dialog = await openPacket('CPL Jones, Alex');
		const stages = within(dialog).getByRole('list', { name: 'Finance stages' });
		expect(within(stages).getByText('7 days')).toBeTruthy();

		await fireEvent.click(within(stages).getByRole('button', { name: 'Advance Finance to Signed' }));

		await waitFor(() => expect(onboardingStore.getById('packet-2')?.steps[1].progressChangedAt).toBe(NOW));
		expect(fetchMock).toHaveBeenCalledWith(
			'/org/org-1/api/onboarding-steps',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ action: 'advanceStage', stepId: 'packet-2-finance', stageName: 'Signed' })
			})
		);
		expect(within(stages).getByText('0 days')).toBeTruthy();
		expect(within(dialog).queryByText('1 stalled')).toBeNull();
		await closePacket(dialog);
		expect(rows()[0].textContent).toContain('Ready');
		expect(screen.getByText('4 Soldiers in processing')).toBeTruthy();
	});
});

describe('Onboarding packet panel', () => {
	it('disables Start onboarding and says why when no template has steps', () => {
		onboardingTemplateStore.load(onboardingTemplateStore.templates, [], 'org-1');
		mount();

		const start = screen.getByRole('button', { name: 'Start onboarding' }) as HTMLButtonElement;
		expect(start.disabled).toBe(true);
		expect(document.getElementById(start.getAttribute('aria-describedby')!)?.textContent).toBe(
			'Build a template first'
		);
	});

	it.each([
		['Space', (box: HTMLElement) => fireEvent.keyDown(box, { key: ' ' })],
		['click', (box: HTMLElement) => fireEvent.click(box)]
	])('saves a checkbox step exactly once from %s', async (_input, activate) => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(Response.json({ id: 'step-1', completed: true, currentStage: null, progressChangedAt: NOW }));
		vi.stubGlobal('fetch', fetchMock);
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await activate(within(dialog).getByRole('checkbox', { name: 'Mark Verify ID card complete' }));

		await waitFor(() => expect(onboardingStore.getById('packet-1')?.steps[0].completed).toBe(true));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			'/org/org-1/api/onboarding-steps',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ action: 'toggleCheckbox', stepId: 'step-1', completed: true })
			})
		);
	});

	it('rolls back a denied checkbox toggle and shows confirmed completion after retry', async () => {
		let deny!: (response: Response) => void;
		let confirm!: (response: Response) => void;
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(() => new Promise<Response>((resolve) => (deny = resolve)))
			.mockImplementationOnce(() => new Promise<Response>((resolve) => (confirm = resolve)));
		vi.stubGlobal('fetch', fetchMock);
		const ctx = mount();
		const toggle = vi.spyOn(ctx, 'handleToggleCheckbox');
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Mark Verify ID card complete' }));
		await fireEvent.click(await within(dialog).findByRole('button', { name: /1 done/ }));
		expect(within(dialog).getByRole('checkbox', { name: 'Mark Verify ID card incomplete' })).toBeTruthy();

		deny(new Response('{}', { status: 403 }));
		await toggle.mock.results[0].value;
		await waitFor(() =>
			expect(within(dialog).getByRole('checkbox', { name: 'Mark Verify ID card complete' })).toBeTruthy()
		);
		expect(onboardingStore.getById('packet-1')).toEqual(packet);

		await fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Mark Verify ID card complete' }));
		confirm(Response.json({ id: 'step-1', completed: true, currentStage: null, progressChangedAt: NOW }));
		await toggle.mock.results[1].value;
		expect(onboardingStore.getById('packet-1')).toEqual({
			...packet,
			steps: [{ ...packet.steps[0], completed: true, progressChangedAt: NOW }]
		});
	});

	it('shows a failed paperwork save, rolls back, and confirms a retry', async () => {
		const paperwork = { ...packet, steps: [finance('packet-1', { currentStage: 'Submitted' })] };
		onboardingStore.load([paperwork], 'org-1');
		const feedback = vi.spyOn(toastStore, 'error');
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(new Response('{}', { status: 503 }))
				.mockResolvedValueOnce(Response.json({ completed: false, currentStage: 'Signed', progressChangedAt: NOW }))
		);
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Set Finance to Signed' }));
		await waitFor(() => expect(feedback).toHaveBeenCalledWith(expect.any(String)));
		expect(onboardingStore.getById('packet-1')).toEqual(paperwork);

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Set Finance to Signed' }));
		await waitFor(() => expect(onboardingStore.getById('packet-1')?.steps[0].currentStage).toBe('Signed'));
	});

	it('adds a note to the open step and shows it once saved', async () => {
		const note = { text: 'Waiting on DEERS appointment', timestamp: NOW, userId: 'user-1' };
		const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'step-1', notes: [note] }));
		vi.stubGlobal('fetch', fetchMock);
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add note' }));
		await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Note for Verify ID card' }), {
			target: { value: '  Waiting on DEERS appointment ' }
		});
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));

		const notes = await within(dialog).findByRole('list', { name: 'Verify ID card notes' });
		expect(within(notes).getByText('Waiting on DEERS appointment')).toBeTruthy();
		await waitFor(() => expect(within(dialog).queryByRole('textbox', { name: 'Note for Verify ID card' })).toBeNull());
		expect(fetchMock).toHaveBeenCalledWith(
			'/org/org-1/api/onboarding-steps',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ action: 'addNote', stepId: 'step-1', text: 'Waiting on DEERS appointment' })
			})
		);
	});

	it('names who wrote each note on the open step', async () => {
		const note = (userId: string, text: string) => ({ text, timestamp: NOW, userId });
		onboardingStore.load(
			[
				{
					...packet,
					steps: [
						{
							...packet.steps[0],
							notes: [
								note('user-alvarez', 'Finance lost the packet'),
								note('user-viewer', 'Resubmitted it'),
								note('user-gone', 'Called twice')
							]
						}
					]
				}
			],
			'org-1'
		);
		const ctx = access(
			createCapabilityMap('configure'),
			'owner',
			noteAuthorLookup({ 'user-alvarez': 'SSG Alvarez' }, 'user-viewer')
		);
		mount([], false, ctx);
		const dialog = await openPacket('SGT Smith, Jane');

		const notes = within(within(dialog).getByRole('list', { name: 'Verify ID card notes' })).getAllByRole('listitem');

		expect(
			notes.map((item) =>
				item.textContent
					?.replace(/\s+/g, ' ')
					.replace(/ · .*$/, '')
					.trim()
			)
		).toEqual(['Finance lost the packet SSG Alvarez', 'Resubmitted it You', 'Called twice Former member']);
	});

	it('keeps the note draft and reports a failed save', async () => {
		const feedback = vi.spyOn(toastStore, 'error');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add note' }));
		const draft = within(dialog).getByRole('textbox', { name: 'Note for Verify ID card' });
		await fireEvent.input(draft, { target: { value: 'Called finance' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));

		await waitFor(() => expect(feedback).toHaveBeenCalledWith('Could not add this note. Try again.'));
		expect((draft as HTMLTextAreaElement).value).toBe('Called finance');
		expect(onboardingStore.getById('packet-1')).toEqual(packet);
	});

	it('keeps a newer note draft open when an earlier note save finishes', async () => {
		const badge = step('packet-1', { id: 'step-2', templateStepId: null, stepName: 'Badge', sortOrder: 1 });
		onboardingStore.load([{ ...packet, steps: [packet.steps[0], badge] }], 'org-1');
		let finish!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve))));
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add note' }));
		await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Note for Verify ID card' }), {
			target: { value: 'First' }
		});
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Badge' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add note' }));
		await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Note for Badge' }), {
			target: { value: 'Second' }
		});

		finish(Response.json({ id: 'step-1', notes: [{ text: 'First', timestamp: NOW, userId: 'user-1' }] }));
		await waitFor(() => expect(onboardingStore.getById('packet-1')?.steps[0].notes).toHaveLength(1));

		const draft = within(dialog).getByRole('textbox', { name: 'Note for Badge' }) as HTMLTextAreaElement;
		expect(draft.value).toBe('Second');
	});

	it('blocks Escape and hides Close packet while a note is unsaved, and closes once it is cancelled', async () => {
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add note' }));
		await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Note for Verify ID card' }), {
			target: { value: 'Call finance Monday' }
		});

		expect(within(dialog).queryByRole('button', { name: 'Close packet' })).toBeNull();
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await tick();
		expect(screen.getByRole('dialog', { name: 'SGT Smith, Jane' })).toBeTruthy();

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		await closePacket(dialog);
	});

	it('stops guarding an unsaved note once its step completes and the editor is gone', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(Response.json({ id: 'step-1', completed: true, currentStage: null, progressChangedAt: NOW }))
		);
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add note' }));
		await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Note for Verify ID card' }), {
			target: { value: 'Call finance Monday' }
		});
		await fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Mark Verify ID card complete' }));
		await waitFor(() => expect(within(dialog).queryByRole('textbox')).toBeNull());

		await closePacket(dialog);
	});

	it('keeps Cancel unavailable while a note save is in flight', async () => {
		let finish!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve))));
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add note' }));
		await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Note for Verify ID card' }), {
			target: { value: 'Called finance' }
		});
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
		expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);

		finish(Response.json({ id: 'step-1', notes: [{ text: 'Called finance', timestamp: NOW, userId: 'user-1' }] }));
		await waitFor(() => expect(within(dialog).queryByRole('textbox')).toBeNull());
		await closePacket(dialog);
	});

	it('closes a packet with an empty note field on Escape', async () => {
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add note' }));
		expect(within(dialog).getByRole('textbox', { name: 'Note for Verify ID card' })).toBeTruthy();

		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('keeps an unsaved note draft when another step is expanded and then closed again', async () => {
		const badge = step('packet-1', { id: 'step-2', templateStepId: null, stepName: 'Badge', sortOrder: 1 });
		onboardingStore.load([{ ...packet, steps: [packet.steps[0], badge] }], 'org-1');
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add note' }));
		await fireEvent.input(within(dialog).getByRole('textbox', { name: 'Note for Verify ID card' }), {
			target: { value: 'Call finance Monday' }
		});
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Badge' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Verify ID card' }));

		const draft = within(dialog).getByRole('textbox', { name: 'Note for Verify ID card' }) as HTMLTextAreaElement;
		expect(draft.value).toBe('Call finance Monday');
	});

	it('returns to the focus step once the expanded step is completed', async () => {
		const badge = step('packet-1', { id: 'step-2', templateStepId: null, stepName: 'Badge', sortOrder: 1 });
		onboardingStore.load([{ ...packet, steps: [packet.steps[0], badge] }], 'org-1');
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(Response.json({ id: 'step-2', completed: true, currentStage: null, progressChangedAt: NOW }))
		);
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Badge' }));
		expect(within(dialog).getByRole('heading', { level: 4, name: 'Badge' })).toBeTruthy();
		await fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Mark Badge complete' }));

		await waitFor(() => expect(within(dialog).queryByRole('heading', { level: 4, name: 'Badge' })).toBeNull());
		expect(within(dialog).getByRole('heading', { level: 4, name: 'Verify ID card' })).toBeTruthy();
	});

	it('warns before closing out with open steps and retries after a failed save', async () => {
		const feedback = vi.spyOn(toastStore, 'error');
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(new Response('{}', { status: 503 }))
				.mockResolvedValueOnce(Response.json({ status: 'completed', completedAt: '2026-06-15', cancelledAt: null }))
		);
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Close out · 1 open' }));
		const confirmation = await screen.findByRole('alertdialog', { name: 'Complete Onboarding' });
		expect(within(confirmation).getByText('Are you sure? There is 1 step still incomplete.')).toBeTruthy();
		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Mark Complete' }));
		await waitFor(() => expect(feedback).toHaveBeenCalledWith(expect.any(String)));
		expect(screen.getByRole('alertdialog', { name: 'Complete Onboarding' })).toBeTruthy();
		await waitFor(() => expect(confirmation.contains(document.activeElement)).toBe(true));
		expect(onboardingStore.getById('packet-1')).toEqual(packet);

		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Mark Complete' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(onboardingStore.getById('packet-1')).toMatchObject({ status: 'completed', steps: packet.steps });
	});

	it('cancels from the More menu and keeps the confirmation open after a failure', async () => {
		const feedback = vi.spyOn(toastStore, 'error');
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(new Response('{}', { status: 503 }))
				.mockResolvedValueOnce(Response.json({ status: 'cancelled', completedAt: null, cancelledAt: '2026-06-15' }))
		);
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await chooseMenuItem(dialog, 'Cancel onboarding');
		const confirmation = await screen.findByRole('alertdialog', { name: 'Cancel Onboarding' });
		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel Onboarding' }));
		await waitFor(() => expect(feedback).toHaveBeenCalledWith(expect.any(String)));
		await waitFor(() => expect(confirmation.contains(document.activeElement)).toBe(true));
		expect(onboardingStore.getById('packet-1')).toEqual(packet);

		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel Onboarding' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(onboardingStore.getById('packet-1')).toMatchObject({ status: 'cancelled', steps: packet.steps });
	});

	it('offers a removed step only as a named Remove action in the More menu', async () => {
		onboardingStore.load(
			[{ ...packet, steps: [packet.steps[0], finance('packet-1', { stepName: 'Finance packet', active: false })] }],
			'org-1'
		);
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		expect(within(dialog).queryByText('Finance packet')).toBeNull();
		expect(within(dialog).getByRole('img', { name: '0 of 1 steps done' })).toBeTruthy();
		const menu = await openMenu(dialog);
		expect(within(menu).getByRole('menuitem', { name: 'Remove Finance packet' })).toBeTruthy();
	});

	it.each(['operate', 'configure'] as const)(
		'offers packet reconciliation in the More menu only to a scoped %s user when permitted',
		async (level) => {
			personnelRosterHydration.load(
				[{ ...person('person-1', 'SGT', 'Smith', 'Jane'), groupId: 'alpha', groupName: 'Alpha' }],
				'org-1'
			);
			const ctx = new OnboardingPageContext(new ModalRegistry(), {
				orgId: 'org-1',
				orgUrlSegment: 'org-1',
				...createClientAccess({
					membershipRole: 'member',
					capabilityMap: { ...createCapabilityMap('none'), onboarding: level },
					scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['alpha'] })
				})
			});
			render(OnboardingActiveView, { props: { ctx, typicalDaysToFinish: null } });
			const dialog = await openPacket('SGT Smith, Jane');

			expect(within(dialog).getByRole('button', { name: 'Close out · 1 open' })).toBeTruthy();
			const items = within(await openMenu(dialog))
				.getAllByRole('menuitem')
				.map((item) => item.textContent?.trim());
			expect(items).toEqual(
				level === 'configure'
					? ['Re-sync with template', 'Switch template', 'Cancel onboarding']
					: ['Cancel onboarding']
			);
			expect(screen.queryByRole('link', { name: 'Templates' })).toBeNull();
		}
	);

	it('offers Switch template once Assign template saves', async () => {
		onboardingStore.load([{ ...packet, templateId: null }], 'org-1');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ templateId: 'template-1', steps: packet.steps })));
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await chooseMenuItem(dialog, 'Assign template');
		const assign = await screen.findByRole('dialog', { name: 'Assign Template' });
		await fireEvent.click(within(assign).getByRole('button', { name: 'Assign Template' }));
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assign Template' })).toBeNull());

		const menu = await openMenu(screen.getByRole('dialog', { name: 'SGT Smith, Jane' }));
		expect(within(menu).getByRole('menuitem', { name: 'Switch template' })).toBeTruthy();
		expect(within(menu).queryByRole('menuitem', { name: 'Assign template' })).toBeNull();
	});

	it('keeps focus in the packet when Assign template saves and the menu offers Switch template', async () => {
		onboardingStore.load([{ ...packet, templateId: null }], 'org-1');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ templateId: 'template-1', steps: packet.steps })));
		mount();
		const dialog = await openPacket('SGT Smith, Jane');

		await chooseMenuItem(dialog, 'Assign template');
		const assign = await screen.findByRole('dialog', { name: 'Assign Template' });
		await fireEvent.click(within(assign).getByRole('button', { name: 'Assign Template' }));
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assign Template' })).toBeNull());

		await waitFor(() =>
			expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'More packet actions' }))
		);
	});

	it('gives a member who cannot manage read-only step content instead of disabled controls', async () => {
		onboardingStore.load([{ ...packet, steps: [packet.steps[0], finance('packet-1')] }], 'org-1');
		render(OnboardingActiveView, {
			props: { ctx: access(createCapabilityMap('view'), 'member'), typicalDaysToFinish: null }
		});
		const dialog = await openPacket('SGT Smith, Jane');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Finance' }));
		const stages = within(dialog).getByRole('list', { name: 'Finance stages' });
		expect(
			within(stages)
				.getAllByRole('listitem')
				.map((item) => item.getAttribute('aria-current'))
		).toEqual([null, 'step', null, null]);
		expect(within(dialog).queryByRole('checkbox')).toBeNull();
		expect(within(dialog).queryByRole('button', { name: /Close out|More packet actions|Add note|Advance/ })).toBeNull();
		expect(
			within(dialog)
				.queryAllByRole('button')
				.filter((button) => (button as HTMLButtonElement).disabled)
		).toEqual([]);
	});

	it.each([
		{ training: 'none', link: false },
		{ training: 'view', link: true }
	] as const)(
		'shows Record training only to a member who can open Training ($training)',
		async ({ training, link }) => {
			const trainingStep = step('packet-1', {
				id: 'step-training',
				templateStepId: null,
				stepName: 'Complete safety course',
				stepType: 'training',
				trainingTypeId: 'training-1'
			});
			onboardingStore.load([{ ...packet, steps: [trainingStep] }], 'org-1');
			const ctx = access({ ...createCapabilityMap('none'), onboarding: 'operate', training }, 'member');
			render(OnboardingActiveView, { props: { ctx, typicalDaysToFinish: null } });

			const dialog = await openPacket('SGT Smith, Jane');

			expect(within(dialog).getByText('Waiting on training record')).toBeTruthy();
			expect(Boolean(within(dialog).queryByRole('link', { name: 'Record training' }))).toBe(link);
		}
	);

	it('collapses done steps behind a toggle and lets done paperwork adjust its stage', async () => {
		onboardingStore.load(
			[
				{
					...packet,
					steps: [
						{ ...packet.steps[0], completed: true },
						finance('packet-1', { currentStage: 'Confirmed', completed: true })
					]
				}
			],
			'org-1'
		);
		mount();
		const dialog = await openPacket('SGT Smith, Jane');
		const toggle = within(dialog).getByRole('button', { name: '2 done · Verify ID card, Finance' });
		expect(toggle.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(within(dialog).getByRole('checkbox', { name: 'Mark Verify ID card incomplete' })).toBeTruthy();

		const financeToggle = within(dialog).getByRole('button', { name: 'Finance' });
		await fireEvent.click(financeToggle);
		expect(financeToggle.getAttribute('aria-expanded')).toBe('true');
		const stages = within(dialog).getByRole('list', { name: 'Finance stages' });
		expect(within(stages).getAllByText('Cleared')).toHaveLength(4);
		expect(within(stages).getByRole('button', { name: 'Set Finance to Signed' })).toBeTruthy();
	});
});

describe('Onboarding Re-sync feedback', () => {
	const other: PersonnelOnboarding = {
		...packet,
		id: 'packet-2',
		personnelId: 'person-2',
		steps: [step('packet-2', { id: 'step-2' })]
	};

	beforeEach(() => onboardingStore.load([packet, other], 'org-1'));

	it('shows a Re-sync failure inside its own packet and clears it after a retry', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(Response.json({ message: 'Template unavailable' }, { status: 503 }))
				.mockResolvedValueOnce(Response.json({ templateId: packet.templateId, steps: packet.steps }))
		);
		const ctx = mount();
		const resync = vi.spyOn(ctx, 'handleResync');

		let own = await openPacket('SGT Smith, Jane');
		await chooseMenuItem(own, 'Re-sync with template');
		await resync.mock.results[0].value;
		await waitFor(() => expect(within(own).getByRole('alert').textContent).toContain('Template unavailable'));
		await closePacket(own);
		expect(screen.getByRole('alert').textContent).toContain('Template unavailable');

		const otherPanel = await openPacket('CPL Jones, Alex');
		expect(within(otherPanel).queryByRole('alert')).toBeNull();
		await closePacket(otherPanel);

		own = await openPacket('SGT Smith, Jane');
		await chooseMenuItem(own, 'Re-sync with template');
		await resync.mock.results[1].value;
		await waitFor(() => expect(within(own).queryByRole('alert')).toBeNull());
		expect(ctx.getResyncError(packet.id)).toBeNull();
		expect(onboardingStore.getById(packet.id)).toEqual(packet);
	});

	it('disables Re-sync only for the packet whose request is pending', async () => {
		let respond!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => (respond = resolve))));
		const ctx = mount();
		const resync = vi.spyOn(ctx, 'handleResync');

		const own = await openPacket('SGT Smith, Jane');
		await chooseMenuItem(own, 'Re-sync with template');
		await closePacket(own);
		const otherPanel = await openPacket('CPL Jones, Alex');
		const otherItem = within(await openMenu(otherPanel)).getByRole('menuitem', { name: 'Re-sync with template' });
		expect(otherItem.hasAttribute('data-disabled')).toBe(false);
		await fireEvent.keyDown(otherItem, { key: 'Escape' });
		await closePacket(otherPanel);

		const pending = await openPacket('SGT Smith, Jane');
		const pendingItem = within(await openMenu(pending)).getByRole('menuitem', { name: 'Re-sync with template' });
		expect(pendingItem.hasAttribute('data-disabled')).toBe(true);
		respond(Response.json({ message: 'First packet unavailable' }, { status: 503 }));
		await resync.mock.results[0].value;
		await waitFor(() => expect(pendingItem.hasAttribute('data-disabled')).toBe(false));
	});

	it('dismisses only the chosen packet error in the list and keeps the other in its packet', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(Response.json({ message: 'First packet unavailable' }, { status: 503 }))
				.mockResolvedValueOnce(Response.json({ message: 'Other packet unavailable' }, { status: 503 }))
		);
		const ctx = mount();
		await ctx.handleResync(packet.id);
		await ctx.handleResync('packet-2');

		const firstNotice = (await screen.findAllByRole('alert')).find((notice) =>
			notice.textContent?.includes('First packet unavailable')
		)!;
		await fireEvent.click(within(firstNotice).getByRole('button', { name: 'Dismiss' }));

		expect(ctx.getResyncError(packet.id)).toBeNull();
		expect(screen.getByRole('alert').textContent).toContain('Other packet unavailable');
		const own = await openPacket('SGT Smith, Jane');
		expect(within(own).queryByRole('alert')).toBeNull();
		await closePacket(own);
		const otherPanel = await openPacket('CPL Jones, Alex');
		expect(within(otherPanel).getByRole('alert').textContent).toContain('Other packet unavailable');
	});
});

describe('Start onboarding', () => {
	async function startFor(name: string) {
		const dialog = screen.getByRole('dialog', { name: 'Start Onboarding' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Member' }));
		await fireEvent.click(await screen.findByRole('option', { name }));
		return within(dialog).getByRole('button', { name: 'Start Onboarding' });
	}

	it('keeps a failed start draft and retries it without reselection', async () => {
		const created = { ...packet, id: 'packet-2', personnelId: 'person-2' };
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('{}', { status: 503 }))
			.mockResolvedValueOnce(Response.json(created, { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Start onboarding' }));
		const submit = await startFor('CPL Jones, Alex');

		await fireEvent.click(submit);
		await screen.findByRole('alert');
		expect(onboardingStore.items).toEqual([packet]);
		expect(screen.getByRole('button', { name: 'Member' }).textContent).toContain('CPL Jones, Alex');

		await fireEvent.click(submit);
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(onboardingStore.getById('packet-2')).toEqual(created);
		expect(fetchMock.mock.calls[1]).toEqual(fetchMock.mock.calls[0]);
	});

	it('creates a Person with the supplied active rank and starts their packet with the saved ID', async () => {
		const created = person('created-person', 'VRA', 'Nolan', 'Avery');
		const createdPacket: PersonnelOnboarding = {
			...packet,
			id: 'created-packet',
			personnelId: created.id,
			steps: []
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 201 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(createdPacket), { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		const rank = (code: string, state: 'active' | 'retired', sortOrder: number): RankCatalogEntry => ({
			code,
			label: code,
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state,
			sortOrder
		});
		mount([rank('VRA', 'active', 0), rank('VRR', 'retired', 1)]);

		await fireEvent.click(screen.getByRole('button', { name: 'Start onboarding' }));
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

		await waitFor(() => expect(onboardingStore.getById('created-packet')).toEqual(createdPacket));
		expect(await screen.findByRole('button', { name: /VRA Nolan, Avery/ })).toBeTruthy();
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

		await fireEvent.click(screen.getByRole('button', { name: 'Start onboarding' }));
		expect((screen.getByRole('button', { name: 'Add Person' }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByRole('alert').textContent).toMatch(/reload/i);
		await fireEvent.click(await startFor('CPL Jones, Alex'));

		await waitFor(() => expect(onboardingStore.getById('packet-2')).toEqual(created));
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('excludes an active member from the picker and lists the newly started packet', async () => {
		const created: PersonnelOnboarding = {
			...packet,
			id: 'packet-2',
			personnelId: 'person-2',
			steps: [step('packet-2', { id: 'step-2' })]
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 })));
		mount();

		await fireEvent.click(screen.getByRole('button', { name: 'Start onboarding' }));
		const dialog = screen.getByRole('dialog', { name: 'Start Onboarding' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Member' }));
		expect(await screen.findByRole('option', { name: 'CPL Jones, Alex' })).toBeTruthy();
		expect(screen.queryByRole('option', { name: 'SGT Smith, Jane' })).toBeNull();
		await fireEvent.click(screen.getByRole('option', { name: 'CPL Jones, Alex' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Start Onboarding' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(rows().map((row) => row.textContent)).toEqual([
			expect.stringContaining('SGT Smith, Jane'),
			expect.stringContaining('CPL Jones, Alex')
		]);
	});
});
