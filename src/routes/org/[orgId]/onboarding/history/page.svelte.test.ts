// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { OnboardingTemplate, PersonnelOnboarding } from '$features/onboarding/contracts';
import { createReadyAppShellRouteData } from '../../appShell.test-support';
import type { Group, Personnel } from '$features/personnel/contracts';
import { openToolbarMore, stubToolbarWidths } from '$lib/test-support/toolbarWidths';

const { gotoMock, shell } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	shell: { canOpenSettings: true }
}));
vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: gotoMock
}));

vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({
		orgId: 'org-1',
		orgUrlSegment: 'org-1',
		userId: 'me',
		scopeSet: { kind: 'organization' },
		affordanceForGovernanceAction: () => ({ visible: shell.canOpenSettings })
	})
}));

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
	shell.canOpenSettings = true;
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	gotoMock.mockReset();
});

const groups: Group[] = [{ id: 'alpha', name: 'Alpha' } as Group, { id: 'bravo', name: 'Bravo' } as Group];
const templates = [
	{ id: 't-new', name: 'New Arrival Packet' },
	{ id: 't-pcs', name: 'PCS In-Processing' }
] as OnboardingTemplate[];

function person(id: string, rank: string, lastName: string, firstName: string, mos: string, group: Group): Personnel {
	return {
		id,
		rank,
		firstName,
		lastName,
		mos,
		clinicRole: 'Medic',
		groupId: group.id,
		groupName: group.name
	} as Personnel;
}

const personnel = [
	person('p-casey', 'SGT', 'Complete', 'Casey', '11B', groups[0]),
	person('p-drew', 'CPL', 'Cancelled', 'Drew', '68W', groups[1]),
	person('p-ellis', 'SPC', 'Early', 'Ellis', '25U', groups[0]),
	person('p-finn', 'PFC', 'Fast', 'Finn', '68W', groups[1]),
	person('p-gray', 'SGT', 'Slow', 'Gray', '11B', groups[0])
];

function packet(
	id: string,
	personnelId: string,
	templateId: string,
	started: string,
	finish: { completedAt?: string; cancelledAt?: string },
	steps: PersonnelOnboarding['steps'] = []
): PersonnelOnboarding {
	return {
		id,
		personnelId,
		templateId,
		startedAt: started,
		completedAt: finish.completedAt ?? null,
		cancelledAt: finish.cancelledAt ?? null,
		status: finish.cancelledAt ? 'cancelled' : 'completed',
		steps
	};
}

function step(
	overrides: Partial<PersonnelOnboarding['steps'][number]> &
		Pick<PersonnelOnboarding['steps'][number], 'id' | 'stepName'>
): PersonnelOnboarding['steps'][number] {
	return {
		onboardingId: 'casey',
		stepType: 'checkbox',
		trainingTypeId: null,
		stages: null,
		sortOrder: 0,
		completed: true,
		currentStage: null,
		notes: [],
		templateStepId: null,
		active: true,
		progressChangedAt: '2026-09-20T12:00:00.000Z',
		...overrides
	};
}

const caseySteps = [
	step({
		id: 's-badge',
		stepName: 'Issue badge',
		sortOrder: 0,
		notes: [{ text: 'Badge printed late', timestamp: '2026-09-02T15:00:00Z', userId: 'alvarez' }]
	}),
	step({
		id: 's-paper',
		stepName: 'Sign orders',
		stepType: 'paperwork',
		stages: ['Submitted', 'Reviewed', 'Filed'],
		currentStage: 'Reviewed',
		completed: false,
		sortOrder: 1,
		notes: [{ text: 'Waiting on S1', timestamp: '2026-09-10T15:00:00Z', userId: 'me' }]
	}),
	step({ id: 's-old', stepName: 'Legacy form', sortOrder: 2, active: false, completed: false })
];

// Today is 2026-10-13. Four completed packets finished in the last 90 days take 10, 12, 14 and 40 days, so the
// typical figure is 13 days and the 40-day packet took long.
const packets: PersonnelOnboarding[] = [
	packet('casey', 'p-casey', 't-new', '2026-09-01', { completedAt: '2026-09-11' }, caseySteps),
	packet('drew', 'p-drew', 't-pcs', '2026-09-20', { cancelledAt: '2026-09-25T10:00:00Z' }),
	packet('ellis', 'p-ellis', 't-pcs', '2026-09-02', { completedAt: '2026-09-14' }),
	packet('finn', 'p-finn', 't-new', '2026-08-31', { completedAt: '2026-09-14' }),
	packet('gray', 'p-gray', 't-pcs', '2026-08-01', { completedAt: '2026-09-10' }),
	{
		...packet('active', 'p-casey', 't-new', '2026-10-01', {}),
		status: 'in_progress'
	}
];

function renderHistory(
	overrides: Partial<{
		onboardings: PersonnelOnboarding[];
		personnel: Personnel[];
		archiveRetentionMonths: number | null;
		noteAuthors: Record<string, string>;
	}> = {}
) {
	return render(Page, {
		props: {
			data: {
				...createReadyAppShellRouteData({ orgId: 'org-1' }),
				identitySessionScope: null,
				session: null,
				history: {
					onboardings: packets,
					personnel,
					templates,
					groups,
					noteAuthors: { alvarez: 'SSG Alvarez' },
					archiveRetentionMonths: 24,
					...overrides
				}
			}
		}
	});
}

function rowNames(): string[] {
	return screen
		.queryAllByRole('button', { expanded: false })
		.concat(screen.queryAllByRole('button', { expanded: true }))
		.filter((button) => button.dataset.slot === 'onboarding-packet-trigger')
		.map((button) => within(button).getAllByText(/, /)[0].textContent ?? '');
}

async function choose(select: string, option: string) {
	await fireEvent.pointerDown(screen.getByRole('button', { name: select }));
	const choice = await screen.findByRole('option', { name: option });
	await fireEvent.pointerDown(choice);
	await fireEvent.pointerUp(choice);
}

describe('onboarding history page', () => {
	it('lists finished packets newest first and leaves out active ones', () => {
		renderHistory();

		expect(rowNames()).toEqual([
			'CPL Cancelled, Drew',
			'SPC Early, Ellis',
			'PFC Fast, Finn',
			'SGT Complete, Casey',
			'SGT Slow, Gray'
		]);
		expect(screen.getByText('5 · most recent first')).toBeTruthy();
	});

	it('summarizes the last 90 days in the header and hides parts it cannot support', () => {
		renderHistory();
		expect(screen.getByText(/5 finished in the last 90 days/)).toBeTruthy();
		expect(screen.getByText(/Typically 13 days to finish/)).toBeTruthy();
		expect(screen.getByText(/1 cancelled/)).toBeTruthy();

		cleanup();
		renderHistory({ onboardings: [packets[1]] });
		expect(screen.queryByText(/Typically/)).toBeNull();
	});

	it('states the real retention and links to settings only for members who may open them', () => {
		renderHistory({ archiveRetentionMonths: 24 });
		expect(screen.getByText(/Kept 24 months after finishing/)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Organization settings' }).getAttribute('href')).toBe(
			'/org/org-1/settings/policies'
		);

		cleanup();
		shell.canOpenSettings = false;
		renderHistory({ archiveRetentionMonths: 1 });
		expect(screen.getByText(/Kept 1 month after finishing/)).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Organization settings' })).toBeNull();
	});

	it('opens one packet at a time and shows its read-only final packet and notes with authors', async () => {
		renderHistory();
		const triggers = () => screen.getAllByRole('button', { name: /, / });

		await fireEvent.click(triggers()[3]);
		const steps = within(await screen.findByRole('list', { name: 'Final packet · read only' }));
		expect(steps.getAllByRole('listitem').map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Done: Issue badge',
			'Open: Sign orders Reviewed',
			'Open: Legacy form Removed from template'
		]);
		expect(screen.queryAllByRole('button', { name: /Sign orders/ })).toEqual([]);

		const notes = within(screen.getByRole('list', { name: 'Notes · 2' })).getAllByRole('listitem');
		expect(notes.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'“Badge printed late” Issue badge · SSG Alvarez · 2 Sep',
			'“Waiting on S1” Sign orders · You · 10 Sep'
		]);

		await fireEvent.click(triggers()[1]);
		await waitFor(() => expect(screen.queryByRole('list', { name: 'Notes · 2' })).toBeNull());
		expect(screen.getAllByText('Final packet · read only')).toHaveLength(1);
		expect(screen.getByText('No notes on this packet.')).toBeTruthy();
	});

	it('filters by outcome, search, Group and Template and offers a way back from an empty result', async () => {
		renderHistory();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }));
		expect(rowNames()).toEqual(['CPL Cancelled, Drew']);
		await fireEvent.click(screen.getByRole('button', { name: 'All' }));

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: '68w' }
		});
		expect(rowNames()).toEqual(['CPL Cancelled, Drew', 'PFC Fast, Finn']);

		await choose('Group', 'Alpha');
		expect(await screen.findByText('No packets match')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
		expect(rowNames()).toHaveLength(5);

		await choose('Template', 'New Arrival Packet');
		expect(rowNames()).toEqual(['PFC Fast, Finn', 'SGT Complete, Casey']);
	});

	it('explains an Organization with no finished packets', () => {
		renderHistory({ onboardings: [packets[5]] });

		expect(screen.getByText('No finished packets yet')).toBeTruthy();
		expect(screen.queryByText(/Kept \d+ months?/)).toBeNull();
	});

	it('links back to Active onboarding from the row and from More', async () => {
		const widths = stubToolbarWidths();
		renderHistory();

		const row = within(screen.getByRole('toolbar', { name: 'Onboarding history controls' }));
		expect(row.getByRole('link', { name: 'Active onboarding' }).getAttribute('href')).toBe('/org/org-1/onboarding');

		await widths.foldAll();
		expect(row.queryByRole('link', { name: 'Active onboarding' })).toBeNull();
		const menu = await openToolbarMore('Onboarding history controls');
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Active onboarding' }));
		await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/org/org-1/onboarding'));
	});

	it('keeps archived personnel visible and does not render its own main landmark', () => {
		renderHistory({
			onboardings: [packets[0]],
			personnel: [{ ...personnel[0], archivedAt: '2026-03-01T00:00:00Z' }]
		});

		expect(screen.getByText('SGT Complete, Casey')).toBeTruthy();
		expect(screen.queryByText('Unknown')).toBeNull();
		expect(screen.queryByRole('main')).toBeNull();
	});
});
