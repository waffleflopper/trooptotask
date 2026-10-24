// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupCatalogHydration, pinnedGroupsHydration } from '$features/personnel';
import type { Personnel } from '../personnel.types';
import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
import type { UpcomingLossRecord } from '$features/personnel/contracts';
import type { ClientAffordance } from '$lib/access/clientAccess';
import { endOrganizationLifetime } from '$lib/stores/core';
import { openToolbarMore, stubToolbarWidths } from '$lib/test-support/toolbarWidths';

const {
	gotoMock,
	beforeNavigateMock,
	invalidateMock,
	toastSuccessMock,
	toastInfoMock,
	toastErrorMock,
	toastWarningMock,
	downloadRosterExportMock
} = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	beforeNavigateMock: vi.fn(),
	invalidateMock: vi.fn(),
	toastSuccessMock: vi.fn(),
	toastInfoMock: vi.fn(),
	toastErrorMock: vi.fn(),
	toastWarningMock: vi.fn(),
	downloadRosterExportMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	beforeNavigate: beforeNavigateMock,
	invalidate: invalidateMock
}));

vi.mock('../rosterExport', async (importOriginal) => ({
	...(await importOriginal<typeof import('../rosterExport')>()),
	downloadRosterExport: downloadRosterExportMock
}));

vi.mock('svelte-sonner', () => ({
	toast: {
		success: toastSuccessMock,
		info: toastInfoMock,
		error: toastErrorMock,
		warning: toastWarningMock,
		dismiss: vi.fn()
	}
}));

import PersonnelPageView from './PersonnelPageView.svelte';
import { RosterSignals } from '../rosterSignals.svelte';

const personnel: Personnel[] = [
	{
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-1',
		groupName: 'Alpha',
		archivedAt: null,
		ets: null,
		deros: null,
		slug: 'smith-jane'
	}
];

async function confirmArchiveDialog(): Promise<void> {
	const dialog = await screen.findByRole('alertdialog');
	await fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function archiveCtx(orgId = 'org-1'): PersonnelPageContext {
	return Object.assign(makeCtx(), {
		orgId,
		canArchivePersonnelRecord: () => true,
		personnelArchiveAffordance: () => allowedAffordance()
	});
}

function batchResponse(result: unknown) {
	return { ok: true, json: async () => result };
}

function submittedIds(fetchMock: ReturnType<typeof vi.fn>): string[][] {
	return fetchMock.mock.calls.map((call) => JSON.parse(String(call[1].body)).ids);
}

async function selectBulkPersonnel(labels: string[]) {
	for (const name of labels) await fireEvent.click(screen.getByRole('checkbox', { name }));
}

const bulkBar = () => within(screen.getByRole('toolbar', { name: 'Selected people' }));
const archiveButton = () => bulkBar().getByRole('button', { name: 'Archive…' });

async function submitBulkSelection() {
	await fireEvent.click(archiveButton());
	await confirmArchiveDialog();
}

/** A viewer who may run every bulk action on everyone. */
function bulkCtx(overrides: Record<string, unknown> = {}): PersonnelPageContext {
	return Object.assign(makeCtx(), {
		canManagePersonnelRecord: () => true,
		canExportPersonnelRecord: () => true,
		canArchivePersonnelRecord: () => true,
		canManagePersonnelInGroup: () => true,
		personnelRecordAffordance: () => allowedAffordance(),
		personnelArchiveAffordance: () => allowedAffordance(),
		...overrides
	});
}

function makePerson(index: number): Personnel {
	return {
		id: `person-${index}`,
		rank: 'SGT',
		lastName: `Soldier${String(index).padStart(3, '0')}`,
		firstName: 'Test',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-1',
		groupName: 'Alpha',
		archivedAt: null,
		ets: null,
		deros: null,
		slug: `soldier-${index}`
	};
}

function makeUpcomingLossRecord(overrides: Partial<UpcomingLossRecord> = {}): UpcomingLossRecord {
	return {
		id: 'person-1',
		personId: 'person-1',
		personName: 'SGT Smith',
		rank: 'SGT',
		lastName: 'Smith',
		triggerType: 'ETS',
		targetDate: '2026-07-01',
		daysRemaining: 78,
		awardDueSoon: true,
		awardTrackingAcknowledged: false,
		groupId: 'group-1',
		...overrides
	};
}

function makeCtx(upcomingLossMap: Map<string, UpcomingLossRecord> = new Map()): PersonnelPageContext {
	const filterPersonnel = (items: Personnel[], query: string): Personnel[] => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return items;
		return items.filter((person) =>
			[
				person.rank,
				person.firstName,
				person.lastName,
				`${person.firstName} ${person.lastName}`,
				`${person.lastName}, ${person.firstName}`,
				person.mos,
				person.clinicRole,
				person.groupName
			].some((value) => value?.toLowerCase().includes(normalized))
		);
	};
	const activePersonnel = () => personnelStore.items.filter((person) => !person.archivedAt);
	let viewMode = $state<'alphabetical' | 'by-group'>('alphabetical');
	let searchQuery = $state('');

	const signals = new RosterSignals({ readPeople: vi.fn(), browserDay: () => '2026-10-23' });
	const ctx = {
		data: { orgId: 'org-1', asOf: '2026-10-06' },
		orgId: 'org-1',
		orgName: 'C Co',
		orgUrlSegment: 'org-1',
		signals,
		canViewAvailability: false,
		signalRow: (person: Personnel) => signals.row(person.id),
		summarizeSignals: (people: Personnel[]) =>
			signals.summarize(
				people.map((person) => person.id),
				new Map(),
				true
			),
		canAddPersonnel: false,
		canImportPersonnel: false,
		canManageGroups: false,
		canViewRoster: true,
		canManagePersonnelRecord: () => false,
		canReadPersonnelDetails: false,
		canOpenPersonnelDetail: () => false,
		canArchivePersonnelRecord: () => false,
		canExportPersonnelRecord: () => false,
		canManagePersonnelInGroup: () => false,
		groupOrder: ['Alpha', 'Bravo'],
		groupIdForName: (name: string) => ({ Alpha: 'group-1', Bravo: 'group-2' })[name] ?? null,
		personnelRecordAffordance: () => deniedAffordance(),
		personnelArchiveAffordance: () => deniedAffordance(),
		get viewMode() {
			return viewMode;
		},
		set viewMode(value: 'alphabetical' | 'by-group') {
			viewMode = value;
		},
		get searchQuery() {
			return searchQuery;
		},
		set searchQuery(value: string) {
			searchQuery = value;
		},
		totalPersonnel: personnelStore.items.length,
		get allActivePersonnel() {
			return activePersonnel();
		},
		get alphabeticalPersonnel() {
			return filterPersonnel(activePersonnel(), ctx.searchQuery);
		},
		get filteredPersonnel() {
			return filterPersonnel(activePersonnel(), ctx.searchQuery);
		},
		getPersonnelById: (id: string) => personnelStore.getById(id),
		upcomingLossMap,
		handleAdd: vi.fn(),
		openGroupEditor: vi.fn()
	};

	return ctx as unknown as PersonnelPageContext;
}

function allowedAffordance(overrides: Partial<ClientAffordance> = {}): ClientAffordance {
	return {
		allowed: true,
		visible: true,
		disabled: false,
		reason: 'allowed:capability',
		explanation: '',
		decision: {} as never,
		...overrides
	};
}

function deniedAffordance(overrides: Partial<ClientAffordance> = {}): ClientAffordance {
	return {
		allowed: false,
		visible: false,
		disabled: false,
		reason: 'denied:missing-capability',
		explanation: '',
		decision: {} as never,
		...overrides
	};
}

describe('PersonnelPageView', () => {
	beforeEach(() => {
		personnelStore.load(personnel, 'org-1');
		pinnedGroupsHydration.load([], 'org-1');
		vi.stubGlobal('fetch', vi.fn());
		gotoMock.mockReset();
		beforeNavigateMock.mockReset();
		invalidateMock.mockReset();
		toastSuccessMock.mockReset();
		toastInfoMock.mockReset();
		toastErrorMock.mockReset();
		toastWarningMock.mockReset();
		downloadRosterExportMock.mockReset();
	});

	afterEach(() => {
		cleanup();
		personnelStore.load([], 'org-test-reset');
		pinnedGroupsHydration.load([], 'org-test-reset');
		vi.unstubAllGlobals();
	});

	it('links import to the dedicated personnel import route', () => {
		const ctx = {
			...makeCtx(),
			canImportPersonnel: true
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx }
		});

		expect(screen.getByRole('link', { name: 'Import' }).getAttribute('href')).toBe('/org/org-1/personnel/import');
	});

	it('keeps creation, group and detail controls hidden for operators who can edit existing personnel', async () => {
		const ctx = {
			...makeCtx(),
			canAddPersonnel: false,
			canImportPersonnel: false,
			canManageGroups: false,
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx }
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Personnel controls' });
		expect(within(toolbar).queryByRole('button', { name: 'Manage Groups' })).toBeNull();
		expect(within(toolbar).queryByRole('button', { name: 'Add Person' })).toBeNull();
		expect(within(toolbar).queryByRole('link', { name: 'Import' })).toBeNull();
		// One sits beside the name, which stays shown where the actions cell hides.
		const quickEdits = screen.getAllByRole('button', { name: 'Quick edit SGT Smith, Jane' });
		expect(quickEdits.some((button) => button.closest('td')?.textContent?.includes('Smith, Jane'))).toBe(true);
		expect(screen.getAllByRole('button', { name: 'Note for SGT Smith, Jane' }).length).toBeGreaterThan(0);
		expect(screen.queryByRole('link', { name: /Smith, Jane/ })).toBeNull();
		await fireEvent.click(screen.getByRole('row', { name: 'SGT Smith, Jane' }));
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('lets a viewer who may only archive select People and offers them Archive alone', async () => {
		render(PersonnelPageView, { props: { ctx: archiveCtx() } });

		const toolbar = screen.getByRole('toolbar', { name: 'Personnel controls' });
		expect(within(toolbar).queryByRole('link', { name: 'Import' })).toBeNull();
		expect(within(toolbar).queryByRole('button', { name: 'Add Person' })).toBeNull();
		await selectBulkPersonnel(['Select SGT Smith, Jane']);

		expect(
			bulkBar()
				.getAllByRole('button')
				.map((button) => button.getAttribute('title'))
		).toEqual(['Archive…', 'Clear selection (Esc)']);
	});

	it('shows no checkboxes to a viewer with no bulk action', () => {
		render(PersonnelPageView, { props: { ctx: makeCtx() } });

		expect(screen.getAllByRole('row', { name: /Smith, Jane/ }).length).toBeGreaterThan(0);
		expect(screen.queryByRole('checkbox')).toBeNull();
	});

	it('filters the roster from the toolbar search item', async () => {
		personnelStore.load(
			[
				...personnel,
				{
					id: 'person-2',
					rank: 'SPC',
					lastName: 'Garcia',
					firstName: 'Luis',
					mos: '11B',
					clinicRole: 'Rifleman',
					groupId: 'group-2',
					groupName: 'Bravo',
					archivedAt: null,
					ets: null,
					deros: null
				}
			],
			'org-1'
		);
		const ctx = makeCtx();

		render(PersonnelPageView, {
			props: { ctx }
		});

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, MOS, role, or group' }), {
			target: { value: 'Luis Garcia' }
		});

		expect(screen.getByText('Garcia, Luis')).toBeTruthy();
		expect(screen.queryByText('Smith, Jane')).toBeNull();
	});

	it('updates the roster view mode from the toolbar view toggle', async () => {
		const ctx = makeCtx();

		render(PersonnelPageView, {
			props: { ctx }
		});

		const azToggle = screen.getByRole('button', { name: 'A-Z' });
		const groupToggle = screen.getByRole('button', { name: 'Group' });

		expect(azToggle.getAttribute('aria-pressed')).toBe('true');
		expect(groupToggle.getAttribute('aria-pressed')).toBe('false');
		expect(screen.queryByRole('button', { name: 'Pin Alpha' })).toBeNull();

		await fireEvent.click(groupToggle);

		expect(screen.getByRole('button', { name: 'A-Z' }).getAttribute('aria-pressed')).toBe('false');
		expect(screen.getByRole('button', { name: 'Group' }).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('button', { name: 'Pin Alpha' })).toBeTruthy();
	});

	describe('By Group view', () => {
		function loadTwoGroups(secondGroupName = 'Bravo'): void {
			personnelStore.load(
				[
					...personnel,
					{
						id: 'person-2',
						rank: 'SPC',
						lastName: 'Garcia',
						firstName: 'Luis',
						mos: '11B',
						clinicRole: 'Rifleman',
						groupId: 'group-2',
						groupName: secondGroupName,
						archivedAt: null,
						ets: null,
						deros: null
					},
					{
						id: 'person-3',
						rank: 'PFC',
						lastName: 'Adams',
						firstName: 'Casey',
						mos: '25U',
						clinicRole: '',
						groupId: null,
						groupName: '',
						archivedAt: null,
						ets: null,
						deros: null
					}
				],
				'org-1'
			);
		}

		const headerOrder = () =>
			screen.getAllByRole('button', { name: /^(Collapse|Expand) / }).map((button) => button.getAttribute('aria-label'));

		it('lists Groups in the Organization order with Unassigned last and drops the Group column', () => {
			loadTwoGroups();
			const ctx = {
				...makeCtx(),
				viewMode: 'by-group',
				groupOrder: ['Bravo', 'Alpha']
			} as unknown as PersonnelPageContext;

			render(PersonnelPageView, { props: { ctx } });

			expect(headerOrder()).toEqual(['Collapse Bravo', 'Collapse Alpha', 'Collapse Unassigned']);
			expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).not.toContain('Group');
		});

		it('keeps the controls of a Group named Unassigned apart from the People with no Group', () => {
			loadTwoGroups('Unassigned');
			const ctx = {
				...makeCtx(),
				viewMode: 'by-group',
				canManageGroups: true,
				groupOrder: ['Alpha', 'Unassigned']
			} as unknown as PersonnelPageContext;

			render(PersonnelPageView, { props: { ctx } });

			expect(headerOrder()).toEqual(['Collapse Alpha', 'Collapse Unassigned', 'Collapse Unassigned']);
			expect(screen.getAllByRole('button', { name: 'Pin Unassigned' })).toHaveLength(1);
			expect(screen.getAllByRole('button', { name: 'Group actions for Unassigned' })).toHaveLength(1);
			expect(screen.getAllByRole('button', { name: 'Assign a Group' })).toHaveLength(1);
		});

		it("moves the viewer's pinned Group above the Organization order", () => {
			loadTwoGroups();
			pinnedGroupsHydration.load(['Alpha'], 'org-1');
			const ctx = {
				...makeCtx(),
				viewMode: 'by-group',
				groupOrder: ['Bravo', 'Alpha']
			} as unknown as PersonnelPageContext;

			render(PersonnelPageView, { props: { ctx } });

			expect(headerOrder()).toEqual(['Collapse Alpha', 'Collapse Bravo', 'Collapse Unassigned']);
		});

		it('keeps the Group column in the A-Z view', () => {
			const ctx = makeCtx();

			render(PersonnelPageView, { props: { ctx } });

			expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).toContain('Group');
		});
	});

	describe('when the toolbar folds', () => {
		const toolbarName = 'Personnel controls';

		function editorCtx(): PersonnelPageContext {
			return {
				...makeCtx(),
				canAddPersonnel: true,
				canImportPersonnel: true,
				canManageGroups: true,
				canArchivePersonnelRecord: () => true,
				personnelArchiveAffordance: () => allowedAffordance()
			} as unknown as PersonnelPageContext;
		}

		it('keeps Add Person on the row and runs the view switch and Manage Groups from More', async () => {
			const widths = stubToolbarWidths();
			const ctx = editorCtx();
			render(PersonnelPageView, { props: { ctx } });
			await widths.foldAll();

			const row = within(screen.getByRole('toolbar', { name: toolbarName }));
			expect(row.queryByRole('button', { name: 'Manage Groups' })).toBeNull();
			expect(row.queryByRole('group', { name: 'Roster sort mode' })).toBeNull();
			await fireEvent.click(row.getByRole('button', { name: 'Add Person' }));
			expect(ctx.handleAdd).toHaveBeenCalledTimes(1);

			let menu = await openToolbarMore(toolbarName);
			const sort = within(within(menu).getByRole('group', { name: 'Roster sort mode' }));
			expect(sort.getByRole('menuitemradio', { name: 'A-Z' }).getAttribute('aria-checked')).toBe('true');
			await fireEvent.click(sort.getByRole('menuitemradio', { name: 'Group' }));
			expect(ctx.viewMode).toBe('by-group');

			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			menu = await openToolbarMore(toolbarName);
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Manage Groups' }));
			await waitFor(() => expect(ctx.openGroupEditor).toHaveBeenCalledTimes(1));
			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			menu = await openToolbarMore(toolbarName);
			expect(within(menu).queryByRole('menuitem', { name: 'Archive' })).toBeNull();
		});

		it('opens the import route when Import is chosen from More', async () => {
			const widths = stubToolbarWidths();
			render(PersonnelPageView, { props: { ctx: editorCtx() } });
			await widths.foldAll();

			const menu = await openToolbarMore(toolbarName);
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Import' }));

			await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/org/org-1/personnel/import'));
		});

		it('keeps actions a roster viewer may not use out of More', async () => {
			const widths = stubToolbarWidths();
			render(PersonnelPageView, { props: { ctx: makeCtx() } });
			await widths.foldAll();

			const menu = await openToolbarMore(toolbarName);
			expect(within(menu).getByRole('group', { name: 'Roster sort mode' })).toBeTruthy();
			for (const name of ['Manage Groups', 'Archive', 'Import', 'Add Person']) {
				expect(within(menu).queryByRole('menuitem', { name })).toBeNull();
			}
			expect(screen.queryByRole('button', { name: 'Add Person' })).toBeNull();
		});
	});

	it('shows a pin immediately and restores the button with a message after a denied save', async () => {
		const ctx = {
			...makeCtx(),
			viewMode: 'by-group'
		} as unknown as PersonnelPageContext;
		let rejectSave!: (error: Error) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise((_resolve, reject) => {
						rejectSave = reject;
					})
			)
		);

		render(PersonnelPageView, {
			props: { ctx }
		});

		const pin = screen.getByRole('button', { name: 'Pin Alpha' });
		expect(pin.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(pin);
		expect(screen.getByRole('button', { name: 'Unpin Alpha' }).getAttribute('aria-pressed')).toBe('true');

		rejectSave(new Error('Save denied'));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Pin Alpha' }).getAttribute('aria-pressed')).toBe('false')
		);
		expect(toastErrorMock.mock.calls.map(([message]) => message)).toEqual([
			'Failed to update pinned Groups. Try again.'
		]);
	});

	it('says loss warnings are unavailable and offers a reload when the window could not be read', async () => {
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });
		const ctx = { ...makeCtx(), lossWarningsUnavailable: true } as unknown as PersonnelPageContext;
		render(PersonnelPageView, { props: { ctx } });

		expect(screen.getByRole('status').textContent).toContain('Loss warnings could not be loaded');
		await fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));
		expect(reload).toHaveBeenCalledOnce();
	});

	describe('upcoming-loss indicators', () => {
		it('shows a loss indicator chip for personnel in the upcoming-loss map', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'ETS' })]]);
			const ctx = {
				...makeCtx(lossMap),
				canManagePersonnelRecord: () => true,
				personnelRecordAffordance: () => allowedAffordance()
			} as unknown as PersonnelPageContext;

			render(PersonnelPageView, {
				props: { ctx }
			});

			expect(screen.getByTestId('loss-indicator-person-1').textContent?.trim()).toBe('ETS · 78d');
		});
	});

	it('updates the row actions when permissions change after render', async () => {
		const editableCtx = {
			...makeCtx(),
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;
		const viewOnlyCtx = {
			...makeCtx(),
			canManagePersonnelRecord: () => false,
			personnelRecordAffordance: () => deniedAffordance()
		} as unknown as PersonnelPageContext;
		const view = render(PersonnelPageView, { props: { ctx: editableCtx } });

		await fireEvent.click(screen.getAllByRole('button', { name: 'Quick edit SGT Smith, Jane' })[0]);
		expect(screen.getByRole('form', { name: 'Quick edit SGT Smith, Jane' })).toBeTruthy();

		await view.rerender({ ctx: viewOnlyCtx });

		expect(screen.queryByRole('button', { name: 'Quick edit SGT Smith, Jane' })).toBeNull();
		await fireEvent.click(screen.getByRole('row', { name: 'SGT Smith, Jane' }));
		expect(gotoMock).not.toHaveBeenCalled();
	});

	function openableCtx(): PersonnelPageContext {
		return {
			...makeCtx(),
			canManagePersonnelRecord: (person: Personnel) => person.id === 'person-1',
			canReadPersonnelDetails: true,
			canOpenPersonnelDetail: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;
	}

	it('opens the record from the row and the name link, a note from Note and the editor in place from Quick edit', async () => {
		render(PersonnelPageView, { props: { ctx: openableCtx() } });

		expect(screen.getByRole('link', { name: /Smith, Jane/ }).getAttribute('href')).toBe(
			'/org/org-1/personnel/smith-jane'
		);
		await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));
		expect(gotoMock).toHaveBeenLastCalledWith('/org/org-1/personnel/smith-jane');

		await fireEvent.click(screen.getAllByRole('button', { name: 'Note for SGT Smith, Jane' })[0]);
		expect(await screen.findByRole('dialog', { name: 'Add to log for SGT Jane Smith' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

		const narrowEdit = screen
			.getAllByRole('button', { name: 'Quick edit SGT Smith, Jane' })
			.find((button) => button.closest('td')?.textContent?.includes('Smith, Jane'));
		await fireEvent.click(narrowEdit!);
		expect(screen.getByRole('form', { name: 'Quick edit SGT Smith, Jane' })).toBeTruthy();
		expect(gotoMock).toHaveBeenCalledTimes(1);
	});

	describe('a second Note while a composer holds typed text', () => {
		async function typeInSmithComposer() {
			personnelStore.load([personnel[0], { ...makePerson(2), lastName: 'Young', slug: 'young-test' }], 'org-1');
			const ctx = {
				...openableCtx(),
				canManagePersonnelRecord: () => true
			} as unknown as PersonnelPageContext;
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getAllByRole('button', { name: 'Note for SGT Smith, Jane' })[0]);
			await fireEvent.input(await screen.findByRole('textbox', { name: 'Follow-up title' }), {
				target: { value: 'Call about leave' }
			});
			await fireEvent.click(screen.getAllByRole('button', { name: /^Note for .*Young/ })[0]);
			await screen.findByText('Discard what you typed?');
		}

		it('opens the requested composer once the typed text is discarded', async () => {
			await typeInSmithComposer();
			await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

			const dialog = await screen.findByRole('dialog', { name: /Add to log for SGT .*Young/ });
			expect(dialog).toBeTruthy();
			expect(screen.queryByRole('dialog', { name: 'Add to log for SGT Jane Smith' })).toBeNull();
			expect((screen.getByRole('textbox', { name: 'Follow-up title' }) as HTMLInputElement).value).toBe('');
		});

		it('keeps the first composer and its text, and drops the request, on Keep editing', async () => {
			await typeInSmithComposer();
			await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

			expect((screen.getByRole('textbox', { name: 'Follow-up title' }) as HTMLInputElement).value).toBe(
				'Call about leave'
			);
			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			await fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		});
	});

	it('moves row focus with the arrow keys and runs N, E and Enter on the focused row only', async () => {
		personnelStore.load([personnel[0], { ...makePerson(2), lastName: 'Young', slug: 'young-test' }], 'org-1');
		render(PersonnelPageView, { props: { ctx: openableCtx() } });
		const smith = screen.getByRole('row', { name: 'Open SGT Smith, Jane' });
		const young = screen.getByRole('row', { name: 'Open SGT Young, Test' });
		expect([smith.tabIndex, young.tabIndex]).toEqual([0, -1]);

		smith.focus();
		await fireEvent.keyDown(smith, { key: 'ArrowDown' });
		expect(document.activeElement).toBe(young);
		expect([smith.tabIndex, young.tabIndex]).toEqual([-1, 0]);

		await fireEvent.keyDown(young, { key: 'e' });
		expect(screen.queryByRole('form')).toBeNull();
		await fireEvent.keyDown(young, { key: 'ArrowUp' });
		await fireEvent.keyDown(smith, { key: 'n' });
		expect(await screen.findByRole('dialog', { name: 'Add to log for SGT Jane Smith' })).toBeTruthy();
		expect(gotoMock).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		await fireEvent.keyDown(smith, { key: 'e' });
		expect(screen.getByRole('form', { name: 'Quick edit SGT Smith, Jane' })).toBeTruthy();
		await fireEvent.keyDown(smith, { key: 'Enter' });
		expect(gotoMock).toHaveBeenLastCalledWith('/org/org-1/personnel/smith-jane');

		await fireEvent.keyDown(screen.getAllByRole('button', { name: 'Note for SGT Smith, Jane' })[0], { key: 'e' });
		expect(screen.getAllByRole('form')).toHaveLength(1);
	});

	describe('quick edit', () => {
		const young: Personnel = { ...makePerson(2), lastName: 'Young', slug: 'young-test' };

		beforeEach(() => groupCatalogHydration.load([{ id: 'group-1', name: 'Alpha', sortOrder: 0 }], 'org-1'));
		afterEach(() => {
			vi.restoreAllMocks();
			groupCatalogHydration.load([], 'org-test-reset');
		});

		function editCtx(overrides: Record<string, unknown> = {}, people = [personnel[0], young]): PersonnelPageContext {
			personnelStore.load(people, 'org-1');
			// Defined on the context itself: spreading it would freeze its roster getters at their first read.
			const base = makeCtx();
			return Object.defineProperties(
				base,
				Object.getOwnPropertyDescriptors(
					Object.defineProperties(
						{
							canManagePersonnelRecord: () => true,
							canReadPersonnelDetails: true,
							canOpenPersonnelDetail: () => true,
							personnelRecordAffordance: () => allowedAffordance()
						},
						Object.getOwnPropertyDescriptors(overrides)
					)
				)
			);
		}

		function savesAs(change: Partial<Personnel>) {
			return vi.spyOn(personnelStore, 'updateOrThrow').mockImplementation(async (id, data) => {
				personnelStore.updateLocalWhere(
					(item) => item.id === id,
					(item) => ({ ...item, ...data, ...change })
				);
				return true;
			});
		}

		function actionsEdit(name = 'SGT Smith, Jane') {
			return screen
				.getAllByRole('button', { name: `Quick edit ${name}` })
				.find((button) => button.getAttribute('title') === 'Quick edit (E)')!;
		}

		async function openEditor(name = 'SGT Smith, Jane') {
			await fireEvent.click(actionsEdit(name));
			return screen.getByRole('form', { name: `Quick edit ${name}` });
		}

		function rowNames() {
			return screen
				.getAllByRole('row')
				.map((row) => row.getAttribute('aria-label'))
				.filter((label) => label?.startsWith('Open '));
		}

		it('opens the row in place with its saved values, Save held back until something changes', async () => {
			render(PersonnelPageView, { props: { ctx: editCtx() } });
			const form = await openEditor();

			expect((within(form).getByLabelText('Last name') as HTMLInputElement).value).toBe('Smith');
			expect((within(form).getByLabelText('First name') as HTMLInputElement).value).toBe('Jane');
			expect((within(form).getByLabelText('MOS') as HTMLInputElement).value).toBe('68W');
			expect((within(form).getByLabelText('Duty role') as HTMLInputElement).value).toBe('Medic');
			expect(within(form).getByRole('button', { name: 'Rank' }).textContent).toContain('SGT');
			expect(within(form).getByText('No changes')).toBeTruthy();
			expect((within(form).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
			expect(actionsEdit().getAttribute('aria-pressed')).toBe('true');
			expect(screen.getByRole('row', { name: 'Open SGT Young, Test' })).toBeTruthy();
		});

		it('repeats each change as old and new before saving, and Enter saves it in place', async () => {
			const update = savesAs({});
			render(PersonnelPageView, { props: { ctx: editCtx() } });
			const form = await openEditor();
			const role = within(form).getByLabelText('Duty role');
			await fireEvent.input(role, { target: { value: 'Senior Medic' } });
			await fireEvent.input(within(form).getByLabelText('MOS'), { target: { value: '68C' } });

			expect(within(form).getByText('2 changes')).toBeTruthy();
			expect(within(form).getByText('MOS 68W → 68C · Duty role Medic → Senior Medic')).toBeTruthy();

			await fireEvent.submit(form);

			await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
			expect(update).toHaveBeenCalledExactlyOnceWith('person-1', {
				rank: 'SGT',
				lastName: 'Smith',
				firstName: 'Jane',
				mos: '68C',
				clinicRole: 'Senior Medic',
				ets: null,
				deros: null,
				groupId: 'group-1',
				groupName: 'Alpha'
			});
			await waitFor(() => {
				const row = screen.getByRole('row', { name: 'Open SGT Smith, Jane' });
				expect(within(row).getByText('68C')).toBeTruthy();
				expect(within(row).getByText('Senior Medic')).toBeTruthy();
			});
			expect(gotoMock).not.toHaveBeenCalled();
		});

		it('points the Name link at the new slug after a rename', async () => {
			savesAs({ slug: 'smith-janet' });
			render(PersonnelPageView, { props: { ctx: editCtx() } });
			const form = await openEditor();
			await fireEvent.input(within(form).getByLabelText('First name'), { target: { value: 'Janet' } });
			await fireEvent.submit(form);

			await waitFor(() =>
				expect(screen.getByRole('link', { name: /Smith, Janet/ }).getAttribute('href')).toBe(
					'/org/org-1/personnel/smith-janet'
				)
			);
		});

		it('cancels with Escape without writing, leaving the saved values', async () => {
			const update = savesAs({});
			render(PersonnelPageView, { props: { ctx: editCtx() } });
			const form = await openEditor();
			const role = within(form).getByLabelText('Duty role');
			await fireEvent.input(role, { target: { value: 'Senior Medic' } });
			await fireEvent.keyDown(role, { key: 'Escape' });

			expect(screen.queryByRole('form')).toBeNull();
			expect(update).not.toHaveBeenCalled();
			expect(within(screen.getByRole('row', { name: 'Open SGT Smith, Jane' })).getByText('Medic')).toBeTruthy();
		});

		it('shows a failed save inline and keeps the row open with what was typed', async () => {
			vi.spyOn(personnelStore, 'updateOrThrow').mockRejectedValue(new Error('You cannot move people into that Group.'));
			render(PersonnelPageView, { props: { ctx: editCtx() } });
			const form = await openEditor();
			await fireEvent.input(within(form).getByLabelText('Duty role'), { target: { value: 'Senior Medic' } });
			await fireEvent.submit(form);

			expect((await within(form).findByRole('alert')).textContent).toContain('You cannot move people into that Group.');
			expect((within(form).getByLabelText('Duty role') as HTMLInputElement).value).toBe('Senior Medic');
			expect((within(form).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false);
		});

		it('names the blank required field after a save attempt and sends nothing', async () => {
			const update = savesAs({});
			render(PersonnelPageView, { props: { ctx: editCtx() } });
			const form = await openEditor();
			const last = within(form).getByLabelText('Last name');
			await fireEvent.input(last, { target: { value: '' } });
			await fireEvent.submit(form);

			expect(await within(form).findByText('Enter a last name.')).toBeTruthy();
			expect(last.getAttribute('aria-invalid')).toBe('true');
			expect(update).not.toHaveBeenCalled();
		});

		it('asks before another row’s editor replaces unsaved changes', async () => {
			render(PersonnelPageView, { props: { ctx: editCtx() } });
			const form = await openEditor();
			await fireEvent.input(within(form).getByLabelText('Duty role'), { target: { value: 'Senior Medic' } });

			await fireEvent.click(actionsEdit('SGT Young, Test'));
			const dialog = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
			expect(screen.getByRole('form', { name: 'Quick edit SGT Smith, Jane' })).toBeTruthy();
			expect((within(form).getByLabelText('Duty role') as HTMLInputElement).value).toBe('Senior Medic');

			await fireEvent.keyDown(screen.getByRole('row', { name: 'Open SGT Young, Test' }), { key: 'e' });
			await fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
			await waitFor(() => expect(screen.getByRole('form', { name: 'Quick edit SGT Young, Test' })).toBeTruthy());
			expect(screen.getAllByRole('form')).toHaveLength(1);
		});

		it('opens the Data sheet at once when nothing changed and after Discard and open when something did', async () => {
			render(PersonnelPageView, { props: { ctx: editCtx() } });
			let form = await openEditor();
			await fireEvent.click(within(form).getByRole('button', { name: 'Full data sheet' }));
			expect(gotoMock).toHaveBeenLastCalledWith('/org/org-1/personnel/smith-jane/data-sheet');

			await fireEvent.input(within(form).getByLabelText('Duty role'), { target: { value: 'Senior Medic' } });
			await fireEvent.click(within(form).getByRole('button', { name: 'Full data sheet' }));
			const dialog = await screen.findByRole('alertdialog', { name: 'Save changes first?' });
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
			expect(gotoMock).toHaveBeenCalledTimes(1);

			form = screen.getByRole('form', { name: 'Quick edit SGT Smith, Jane' });
			await fireEvent.click(within(form).getByRole('button', { name: 'Full data sheet' }));
			await fireEvent.click(
				within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard and open' })
			);
			await waitFor(() => expect(gotoMock).toHaveBeenCalledTimes(2));
			expect(gotoMock).toHaveBeenLastCalledWith('/org/org-1/personnel/smith-jane/data-sheet');
		});

		it('saves first when asked to Save and open', async () => {
			const update = savesAs({});
			render(PersonnelPageView, { props: { ctx: editCtx() } });
			const form = await openEditor();
			await fireEvent.input(within(form).getByLabelText('Duty role'), { target: { value: 'Senior Medic' } });
			await fireEvent.click(within(form).getByRole('button', { name: 'Full data sheet' }));
			await fireEvent.click(
				within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Save and open' })
			);

			await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/org/org-1/personnel/smith-jane/data-sheet'));
			expect(update).toHaveBeenCalledTimes(1);
		});

		it('does not follow Save and open to the Data sheet after the roster is left', async () => {
			const write = deferred<boolean>();
			vi.spyOn(personnelStore, 'updateOrThrow').mockReturnValue(write.promise);
			render(PersonnelPageView, { props: { ctx: editCtx() } });
			const form = await openEditor();
			await fireEvent.input(within(form).getByLabelText('Duty role'), { target: { value: 'Senior Medic' } });
			await fireEvent.click(within(form).getByRole('button', { name: 'Full data sheet' }));
			await fireEvent.click(
				within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Save and open' })
			);
			cleanup();
			write.resolve(true);
			await Promise.resolve();
			await Promise.resolve();

			expect(gotoMock).not.toHaveBeenCalled();
		});

		describe('leaving the roster with unsaved changes', () => {
			/** Runs a destination through the page's registered guard the way SvelteKit does before it commits. */
			function router() {
				const visited: string[] = [];
				const go = (href: string, type: 'goto' | 'link' | 'popstate' = 'goto') => {
					let cancelled = false;
					const guard = beforeNavigateMock.mock.calls.at(-1)![0] as (navigation: unknown) => void;
					guard({
						type,
						willUnload: false,
						to: { url: new URL(href, 'http://localhost') },
						cancel: () => (cancelled = true)
					});
					if (!cancelled) visited.push(href);
				};
				gotoMock.mockImplementation((href: string) => go(href));
				return { visited, go };
			}

			async function dirtySmith() {
				const nav = router();
				render(PersonnelPageView, { props: { ctx: editCtx() } });
				const form = await openEditor();
				await fireEvent.input(within(form).getByLabelText('Duty role'), { target: { value: 'Senior Medic' } });
				return nav;
			}

			async function askedBeforeLeaving() {
				return within(await screen.findByRole('alertdialog', { name: 'Save changes first?' }));
			}

			it('holds a click on another row until the draft is saved or discarded', async () => {
				const nav = await dirtySmith();
				await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Young, Test' }));

				expect(nav.visited).toEqual([]);
				await fireEvent.click((await askedBeforeLeaving()).getByRole('button', { name: 'Discard and leave' }));
				expect(nav.visited).toEqual(['/org/org-1/personnel/young-test']);
				expect(screen.queryByRole('form')).toBeNull();
			});

			it('holds the Name link', async () => {
				const nav = await dirtySmith();
				const link = screen.getByRole('link', { name: /Young, Test/ });
				await fireEvent.click(link);
				nav.go(link.getAttribute('href')!, 'link');

				expect(nav.visited).toEqual([]);
				await fireEvent.click((await askedBeforeLeaving()).getByRole('button', { name: 'Cancel' }));
				expect(nav.visited).toEqual([]);
				expect((screen.getByLabelText('Duty role') as HTMLInputElement).value).toBe('Senior Medic');
			});

			it('opens the Note composer in place without leaving the roster or losing the draft', async () => {
				const nav = await dirtySmith();
				await fireEvent.click(screen.getAllByRole('button', { name: 'Note for SGT Young, Test' })[0]);

				expect(await screen.findByRole('dialog', { name: /Add to log for SGT .*Young/ })).toBeTruthy();
				expect(nav.visited).toEqual([]);
				expect(screen.queryByRole('alertdialog')).toBeNull();
				expect((screen.getByLabelText('Duty role') as HTMLInputElement).value).toBe('Senior Medic');
			});

			it('holds browser Back and stays on the roster with the draft after Cancel', async () => {
				const nav = await dirtySmith();
				nav.go('/org/org-1/dashboard', 'popstate');

				expect(nav.visited).toEqual([]);
				await fireEvent.click((await askedBeforeLeaving()).getByRole('button', { name: 'Cancel' }));
				expect(screen.getByRole('form', { name: 'Quick edit SGT Smith, Jane' })).toBeTruthy();
				expect((screen.getByLabelText('Duty role') as HTMLInputElement).value).toBe('Senior Medic');
			});

			it('lets a click through when nothing is unsaved', async () => {
				const nav = router();
				render(PersonnelPageView, { props: { ctx: editCtx() } });
				await openEditor();
				await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Young, Test' }));

				expect(nav.visited).toEqual(['/org/org-1/personnel/young-test']);
				expect(screen.queryByRole('alertdialog')).toBeNull();
			});
		});

		describe('row order', () => {
			const able: Personnel = { ...makePerson(1), lastName: 'Able', slug: 'able-test' };
			const baker: Personnel = { ...makePerson(2), lastName: 'Baker', slug: 'baker-test' };

			function sortedByNameCtx(): PersonnelPageContext {
				return editCtx(
					{
						get alphabeticalPersonnel() {
							return personnelStore.items
								.filter((person) => !person.archivedAt)
								.sort((a, b) => a.lastName.localeCompare(b.lastName));
						}
					},
					[able, baker]
				);
			}

			async function renameAbleToZulu() {
				const form = await openEditor('SGT Able, Test');
				await fireEvent.input(within(form).getByLabelText('Last name'), { target: { value: 'Zulu' } });
				await fireEvent.submit(form);
				await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
			}

			it('keeps a row in place when a save leaves the sorted column unchanged', async () => {
				savesAs({});
				render(PersonnelPageView, { props: { ctx: sortedByNameCtx() } });
				await fireEvent.click(screen.getByRole('button', { name: 'Sort by MOS' }));
				expect(rowNames()).toEqual(['Open SGT Able, Test', 'Open SGT Baker, Test']);

				await renameAbleToZulu();

				await waitFor(() => expect(rowNames()).toEqual(['Open SGT Zulu, Test', 'Open SGT Baker, Test']));
			});

			it('moves the row when the save changes the sorted column', async () => {
				savesAs({});
				render(PersonnelPageView, { props: { ctx: sortedByNameCtx() } });
				expect(rowNames()).toEqual(['Open SGT Able, Test', 'Open SGT Baker, Test']);

				await renameAbleToZulu();

				await waitFor(() => expect(rowNames()).toEqual(['Open SGT Baker, Test', 'Open SGT Zulu, Test']));
			});
		});

		it('leaves the Data sheet link out for a viewer who cannot open the record', async () => {
			render(PersonnelPageView, { props: { ctx: editCtx({ canOpenPersonnelDetail: () => false }) } });
			const form = await openEditor('SGT Smith, Jane');

			expect(within(form).queryByRole('button', { name: 'Full data sheet' })).toBeNull();
		});
	});

	describe('roster signals', () => {
		const LEAVE = { id: 'leave', name: 'Leave', color: '#2563eb', textColor: '#ffffff', sortOrder: 0 };
		const ACCESS = {
			availability: true,
			training: true,
			criticalTasks: false,
			evaluations: false,
			followUps: false,
			counseling: false
		};

		function signalsCtx(canViewAvailability = true) {
			personnelStore.load([personnel[0], { ...makePerson(2), lastName: 'Young' }], 'org-1');
			return { ...makeCtx(), canViewAvailability } as unknown as PersonnelPageContext;
		}

		const lane = (people: unknown[]) => ({ asOf: '2026-10-23', access: ACCESS, statusTypes: [LEAVE], people });
		const smith = {
			personnelId: 'person-1',
			today: { kind: 'known', value: { kind: 'away', statusTypeId: 'leave' } },
			attention: {
				kind: 'known',
				value: {
					kind: 'attention',
					first: { kind: 'training', status: 'expired', title: 'CPR/BLS', days: -3 },
					otherCount: 2,
					worst: 'red'
				}
			},
			matches: {},
			openFollowUps: { kind: 'withheld' }
		};
		const young = {
			personnelId: 'person-2',
			today: { kind: 'known', value: { kind: 'present' } },
			attention: { kind: 'known', value: { kind: 'clear' } },
			matches: {},
			openFollowUps: { kind: 'withheld' }
		};

		it('holds quiet placeholders until the lane settles, then shows each dot, attention cell and the headcount', async () => {
			const ctx = signalsCtx();
			const held = Promise.withResolvers<never>();
			ctx.signals.observe('org-1', '2026-10-23', held.promise);
			render(PersonnelPageView, { props: { ctx } });

			const headcount = screen.getByRole('list', { name: "Today's headcount" });
			expect(within(headcount).queryByText('present')).toBeNull();
			expect(screen.queryByRole('img', { name: 'Present today' })).toBeNull();
			expect(screen.getByRole('row', { name: 'SGT Smith, Jane' })).toBeTruthy();

			held.resolve(lane([smith, young]) as never);
			const smithRow = within(await screen.findByRole('row', { name: 'SGT Smith, Jane' }));
			await waitFor(() => expect(smithRow.getByRole('img', { name: 'Leave today' })).toBeTruthy());
			expect(smithRow.getAllByTitle('CPR/BLS expired · 2 more')[0]).toBeTruthy();
			const youngRow = within(screen.getByRole('row', { name: 'SGT Young, Test' }));
			expect(youngRow.getByRole('img', { name: 'Present today' })).toBeTruthy();
			expect(youngRow.getAllByText('—')[0]).toBeTruthy();
			expect(youngRow.queryByTitle('CPR/BLS expired · 2 more')).toBeNull();
			expect(
				within(headcount)
					.getAllByRole('listitem')
					.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())
			).toEqual(['1 present', '1 Leave']);
		});

		it('hides the headcount from a viewer who cannot read availability', () => {
			const ctx = signalsCtx(false);
			ctx.signals.observe('org-1', '2026-10-23', Promise.withResolvers<never>().promise);
			render(PersonnelPageView, { props: { ctx } });
			expect(screen.queryByRole('list', { name: "Today's headcount" })).toBeNull();
		});

		it('keeps the roster usable with blank cells and offers Reload when the lane fails', async () => {
			const ctx = signalsCtx();
			ctx.signals.observe('org-1', '2026-10-23', Promise.reject(new Error('statement timeout')));
			render(PersonnelPageView, { props: { ctx } });

			const reload = await screen.findByRole('button', { name: 'Reload' });
			expect(screen.queryByRole('list', { name: "Today's headcount" })).toBeNull();
			expect(screen.queryByRole('img', { name: /today/ })).toBeNull();
			expect(screen.getByRole('row', { name: 'SGT Smith, Jane' })).toBeTruthy();
			await fireEvent.click(reload);
			expect(invalidateMock).toHaveBeenCalledExactlyOnceWith('app:personnel-signals');
		});
	});

	describe('bulk selection', () => {
		const young = () => ({ ...makePerson(2), lastName: 'Young', slug: 'young-test' });
		const adams = () => ({ ...makePerson(3), lastName: 'Adams', groupId: 'group-2', groupName: 'Bravo' });
		const checkbox = (name: string) => screen.getByRole('checkbox', { name });
		const checked = (name: string) => checkbox(name).getAttribute('aria-checked');

		beforeEach(() => personnelStore.load([personnel[0], young(), adams()], 'org-1'));

		it('selects everyone shown from the header, shows a partial header and clears on Esc', async () => {
			render(PersonnelPageView, { props: { ctx: bulkCtx() } });

			await fireEvent.click(checkbox('Select everyone shown'));
			expect(bulkBar().getByText('3 selected')).toBeTruthy();
			await fireEvent.click(checkbox('Select SGT Young, Test'));
			expect(checked('Select everyone shown')).toBe('mixed');
			expect(bulkBar().getByText('2 selected')).toBeTruthy();

			await fireEvent.keyDown(screen.getByRole('row', { name: 'SGT Smith, Jane' }), { key: 'Escape' });
			expect(screen.queryByRole('toolbar', { name: 'Selected people' })).toBeNull();
			expect(checked('Select SGT Smith, Jane')).toBe('false');
		});

		it('selects a range in shown order with Shift-click and toggles the focused row with Space or x', async () => {
			render(PersonnelPageView, { props: { ctx: bulkCtx() } });

			await fireEvent.click(checkbox('Select SGT Adams, Test'));
			await fireEvent.click(checkbox('Select SGT Young, Test'), { shiftKey: true });
			expect(['Adams, Test', 'Smith, Jane', 'Young, Test'].map((name) => checked(`Select SGT ${name}`))).toEqual([
				'true',
				'true',
				'true'
			]);

			const smith = screen.getByRole('row', { name: 'SGT Smith, Jane' });
			await fireEvent.keyDown(smith, { key: ' ' });
			expect(checked('Select SGT Smith, Jane')).toBe('false');
			await fireEvent.keyDown(smith, { key: 'x' });
			expect(checked('Select SGT Smith, Jane')).toBe('true');
		});

		it('keeps a selection through search, says how many it hides and warns before archiving them', async () => {
			render(PersonnelPageView, { props: { ctx: bulkCtx() } });
			await selectBulkPersonnel(['Select SGT Smith, Jane', 'Select SGT Young, Test']);

			await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, MOS, role, or group' }), {
				target: { value: 'Young' }
			});

			const bar = screen.getByRole('toolbar', { name: 'Selected people' });
			expect(bar.textContent?.replace(/\s+/g, ' ')).toContain('2 selected · 1 hidden by search');
			await fireEvent.click(archiveButton());
			const dialog = await screen.findByRole('alertdialog');
			expect(dialog.textContent).toContain('Archive 2 personnel?');
			expect(dialog.textContent).toContain('This includes 1 person your search hides.');
		});

		it('offers each bulk action only to a viewer who holds its permission', async () => {
			const view = render(PersonnelPageView, {
				props: {
					ctx: bulkCtx({ canExportPersonnelRecord: () => false, canArchivePersonnelRecord: () => false })
				}
			});
			await selectBulkPersonnel(['Select SGT Smith, Jane']);
			const titles = () =>
				bulkBar()
					.getAllByRole('button')
					.map((button) => button.getAttribute('title'));
			expect(titles()).toEqual(['Follow-up for each', 'Add note', 'Move to Group', 'Clear selection (Esc)']);
			view.unmount();

			render(PersonnelPageView, {
				props: {
					ctx: bulkCtx({ canManagePersonnelRecord: () => false, canArchivePersonnelRecord: () => false })
				}
			});
			await selectBulkPersonnel(['Select SGT Smith, Jane']);
			expect(titles()).toEqual(['Export', 'Clear selection (Esc)']);
		});

		it('adds one follow-up for each selected Person in one request and refreshes only their signals', async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValue(
					Response.json({ writtenIds: ['person-1', 'person-2'], unavailableIds: [] }, { status: 201 })
				);
			vi.stubGlobal('fetch', fetchMock);
			const ctx = bulkCtx({
				canManagePersonnelRecord: (person: Personnel) => person.id !== 'person-3'
			});
			const refresh = vi.spyOn(ctx.signals, 'refresh').mockResolvedValue(undefined);
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(checkbox('Select everyone shown'));

			await fireEvent.click(bulkBar().getByRole('button', { name: 'Follow-up for each' }));
			const dialog = await screen.findByRole('dialog', { name: 'Add to log for 2 people' });
			expect(within(dialog).queryByText('Already open')).toBeNull();
			await fireEvent.input(within(dialog).getByPlaceholderText('What needs to happen?'), {
				target: { value: 'Turn in CIF hand receipt' }
			});
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Add follow-up' }));

			await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1));
			expect(toastSuccessMock.mock.calls[0][0]).toBe('Follow-up added for 2 people · 1 person skipped');
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const [url, init] = fetchMock.mock.calls[0];
			expect(url).toBe('/org/org-1/api/personnel/follow-ups/batch');
			expect(JSON.parse(String(init.body)).personnelIds).toEqual(['person-1', 'person-2']);
			expect(refresh).toHaveBeenCalledExactlyOnceWith(['person-1', 'person-2']);
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		});

		it('opens a row Note only after the bulk composer’s typed text is discarded', async () => {
			render(PersonnelPageView, { props: { ctx: bulkCtx() } });
			await fireEvent.click(checkbox('Select everyone shown'));
			await fireEvent.click(bulkBar().getByRole('button', { name: 'Follow-up for each' }));
			const bulk = await screen.findByRole('dialog', { name: 'Add to log for 3 people' });
			await fireEvent.input(within(bulk).getByPlaceholderText('What needs to happen?'), {
				target: { value: 'Turn in CIF hand receipt' }
			});

			await fireEvent.click(screen.getAllByRole('button', { name: 'Note for SGT Smith, Jane' })[0]);
			await fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

			await screen.findByRole('dialog', { name: 'Add to log for SGT Jane Smith' });
			expect(screen.queryByRole('dialog', { name: 'Add to log for 3 people' })).toBeNull();
		});

		it('moves the selected People to the chosen Group in one request and rereads their signals', async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValue(Response.json({ movedIds: ['person-1', 'person-2'], unavailableIds: [] }));
			vi.stubGlobal('fetch', fetchMock);
			const ctx = bulkCtx();
			const refresh = vi.spyOn(ctx.signals, 'refresh').mockResolvedValue(undefined);
			render(PersonnelPageView, { props: { ctx } });
			await selectBulkPersonnel(['Select SGT Smith, Jane', 'Select SGT Young, Test']);

			await fireEvent.keyDown(bulkBar().getByRole('button', { name: 'Move to Group' }), { key: 'Enter' });
			const menu = await screen.findByRole('menu');
			expect(
				within(menu)
					.getAllByRole('menuitem')
					.map((item) => item.textContent?.trim())
			).toEqual(['Alpha', 'Bravo', 'Unassigned']);
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Bravo' }));

			await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1));
			expect(toastSuccessMock.mock.calls[0][0]).toBe('Moved 2 people to Bravo');
			expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
				personnelIds: ['person-1', 'person-2'],
				groupId: 'group-2'
			});
			expect(personnelStore.getById('person-1')?.groupName).toBe('Bravo');
			expect(refresh).toHaveBeenCalledExactlyOnceWith(['person-1', 'person-2']);
		});

		it('rereads the signals of everyone it moved even if the selection changed while the move ran', async () => {
			const reply = deferred<Response>();
			vi.stubGlobal('fetch', vi.fn().mockReturnValue(reply.promise));
			const ctx = bulkCtx();
			const refresh = vi.spyOn(ctx.signals, 'refresh').mockResolvedValue(undefined);
			render(PersonnelPageView, { props: { ctx } });
			await selectBulkPersonnel(['Select SGT Smith, Jane', 'Select SGT Young, Test']);

			await fireEvent.keyDown(bulkBar().getByRole('button', { name: 'Move to Group' }), { key: 'Enter' });
			await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Bravo' }));
			await fireEvent.click(checkbox('Select SGT Young, Test'));
			expect(bulkBar().getByText('1 selected')).toBeTruthy();
			reply.resolve(Response.json({ movedIds: ['person-1', 'person-2'], unavailableIds: [] }));

			await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1));
			expect(toastSuccessMock.mock.calls[0][0]).toBe('Moved 2 people to Bravo');
			expect(refresh).toHaveBeenCalledExactlyOnceWith(['person-1', 'person-2']);
			expect(personnelStore.getById('person-2')?.groupName).toBe('Bravo');
		});

		it('says nothing when an export fails after the Organization was left', async () => {
			const download = deferred<void>();
			downloadRosterExportMock.mockReturnValue(download.promise);
			render(PersonnelPageView, { props: { ctx: bulkCtx() } });
			await selectBulkPersonnel(['Select SGT Smith, Jane']);

			await fireEvent.click(bulkBar().getByRole('button', { name: 'Export' }));
			expect(downloadRosterExportMock).toHaveBeenCalledTimes(1);
			endOrganizationLifetime();
			download.reject(new Error('workbook failed'));
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(toastErrorMock).not.toHaveBeenCalled();
		});

		it('reports a failed export while the Organization is still open', async () => {
			downloadRosterExportMock.mockRejectedValue(new Error('workbook failed'));
			render(PersonnelPageView, { props: { ctx: bulkCtx() } });
			await selectBulkPersonnel(['Select SGT Smith, Jane']);

			await fireEvent.click(bulkBar().getByRole('button', { name: 'Export' }));

			await waitFor(() =>
				expect(toastErrorMock).toHaveBeenCalledExactlyOnceWith(
					'The export could not be created. Try again.',
					expect.anything()
				)
			);
		});

		it('says nothing and rereads nothing when a note finishes after the Organization was left', async () => {
			const reply = deferred<Response>();
			vi.stubGlobal('fetch', vi.fn().mockReturnValue(reply.promise));
			const ctx = bulkCtx();
			const refresh = vi.spyOn(ctx.signals, 'refresh').mockResolvedValue(undefined);
			render(PersonnelPageView, { props: { ctx } });
			await selectBulkPersonnel(['Select SGT Smith, Jane']);

			await fireEvent.click(bulkBar().getByRole('button', { name: 'Follow-up for each' }));
			const dialog = await screen.findByRole('dialog', { name: 'Add to log for 1 person' });
			await fireEvent.input(within(dialog).getByPlaceholderText('What needs to happen?'), {
				target: { value: 'Turn in CIF hand receipt' }
			});
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Add follow-up' }));
			endOrganizationLifetime();
			reply.resolve(Response.json({ writtenIds: ['person-1'], unavailableIds: [] }, { status: 201 }));
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(toastSuccessMock).not.toHaveBeenCalled();
			expect(toastWarningMock).not.toHaveBeenCalled();
			expect(refresh).not.toHaveBeenCalled();
		});
	});

	it('opens one note for everyone in a Group from its header menu', async () => {
		personnelStore.load([personnel[0], { ...makePerson(2), lastName: 'Young' }], 'org-1');
		const ctx = bulkCtx();
		ctx.viewMode = 'by-group';
		render(PersonnelPageView, { props: { ctx } });

		await fireEvent.keyDown(screen.getByRole('button', { name: 'Group actions for Alpha' }), { key: 'Enter' });
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Note to everyone in the Group' }));

		expect(await screen.findByRole('dialog', { name: 'Add to log for Alpha · 2 people' })).toBeTruthy();
	});

	it('archives selected personnel from the bulk bar after confirmation', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(batchResponse({ archivedIds: ['person-1'], approvalRequestedIds: [], errors: [] }));
		vi.stubGlobal('fetch', fetchMock);
		render(PersonnelPageView, { props: { ctx: archiveCtx() } });

		await selectBulkPersonnel(['Select SGT Smith, Jane']);
		await submitBulkSelection();

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/archive-batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: ['person-1'] })
			})
		);
		await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith('app:personnel-data'));
		expect(screen.queryByText('Smith, Jane')).toBeNull();
		expect(screen.queryByRole('toolbar', { name: 'Selected people' })).toBeNull();
	});

	it('selects only the current A-Z page from the header checkbox', async () => {
		const roster = Array.from({ length: 76 }, (_, index) => makePerson(index + 1));
		personnelStore.load(roster, 'org-1');
		const fetchMock = vi.fn().mockResolvedValue(
			batchResponse({
				archivedIds: roster.slice(0, 75).map((person) => person.id),
				approvalRequestedIds: [],
				errors: []
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		render(PersonnelPageView, { props: { ctx: archiveCtx() } });

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select everyone shown' }));
		expect(bulkBar().getByText('75 selected')).toBeTruthy();
		await submitBulkSelection();

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const request = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { ids: string[] };
		expect(request.ids).toHaveLength(75);
		expect(request.ids).toContain('person-1');
		expect(request.ids).not.toContain('person-76');
	});

	it('shows an approval-request toast for selected personnel that need admin approval', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(batchResponse({ archivedIds: [], approvalRequestedIds: ['person-1'], errors: [] }))
		);
		render(PersonnelPageView, { props: { ctx: archiveCtx() } });

		await selectBulkPersonnel(['Select SGT Smith, Jane']);
		await submitBulkSelection();

		await waitFor(() =>
			expect(toastInfoMock).toHaveBeenCalledWith('1 archival requests submitted for admin approval.', {
				duration: 4000,
				action: undefined
			})
		);
		expect(toastSuccessMock).not.toHaveBeenCalled();
		expect(toastErrorMock).not.toHaveBeenCalled();
		expect(invalidateMock).toHaveBeenCalledWith('app:personnel-data');
		expect(screen.getByText('Smith, Jane')).toBeTruthy();
	});

	it('shows an error toast when selected personnel cannot be archived', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				batchResponse({
					archivedIds: [],
					approvalRequestedIds: [],
					errors: [{ id: 'person-1', message: 'Archive failed' }]
				})
			)
		);
		render(PersonnelPageView, { props: { ctx: archiveCtx() } });

		await selectBulkPersonnel(['Select SGT Smith, Jane']);
		await submitBulkSelection();

		await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
		expect(toastSuccessMock).not.toHaveBeenCalled();
		expect(toastInfoMock).not.toHaveBeenCalled();
		expect(invalidateMock).not.toHaveBeenCalled();
		expect(screen.getByText('Smith, Jane')).toBeTruthy();
	});

	it.each(['response', 'transport', 'json', 'null'] as const)(
		'retains the same selection for explicit retry after an unconfirmed %s outcome',
		async (failure) => {
			const fetchMock = vi.fn();
			if (failure === 'transport') fetchMock.mockRejectedValueOnce(new Error('offline'));
			else
				fetchMock.mockResolvedValueOnce({
					ok: failure !== 'response',
					json:
						failure === 'json'
							? async () => {
									throw new Error('invalid JSON');
								}
							: async () => null
				});
			fetchMock.mockResolvedValueOnce(
				batchResponse({ archivedIds: ['person-1'], approvalRequestedIds: [], errors: [] })
			);
			vi.stubGlobal('fetch', fetchMock);
			render(PersonnelPageView, { props: { ctx: archiveCtx() } });
			await selectBulkPersonnel(['Select SGT Smith, Jane']);
			await submitBulkSelection();
			await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
			expect(screen.getByRole('checkbox', { name: 'Select SGT Smith, Jane' }).getAttribute('aria-checked')).toBe(
				'true'
			);
			expect(screen.getByText('Smith, Jane')).toBeTruthy();
			expect(invalidateMock).not.toHaveBeenCalled();
			expect(toastSuccessMock).not.toHaveBeenCalled();
			expect(fetchMock).toHaveBeenCalledTimes(1);
			await waitFor(() => expect(archiveButton()).toHaveProperty('disabled', false));
			await submitBulkSelection();
			await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1));
			expect(submittedIds(fetchMock)).toEqual([['person-1'], ['person-1']]);
		}
	);

	it.each(['archived', 'approval'] as const)(
		'retries only the failed target after a partial %s acknowledgement',
		async (outcome) => {
			personnelStore.load([personnel[0], makePerson(2)], 'org-1');
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(
					batchResponse({
						archivedIds: outcome === 'archived' ? ['person-1'] : [],
						approvalRequestedIds: outcome === 'approval' ? ['person-1'] : [],
						errors: [{ id: 'person-2', message: 'per-record failure' }]
					})
				)
				.mockResolvedValueOnce(batchResponse({ archivedIds: [], approvalRequestedIds: ['person-2'], errors: [] }));
			vi.stubGlobal('fetch', fetchMock);
			render(PersonnelPageView, { props: { ctx: archiveCtx() } });
			await selectBulkPersonnel(['Select SGT Smith, Jane', 'Select SGT Soldier002, Test']);
			await submitBulkSelection();
			await waitFor(() => expect(invalidateMock).toHaveBeenCalledExactlyOnceWith('app:personnel-data'));
			await waitFor(() => expect(archiveButton()).toHaveProperty('disabled', false));
			expect(bulkBar().getByText('1 selected')).toBeTruthy();
			if (outcome === 'archived') expect(screen.queryByText('Smith, Jane')).toBeNull();
			else
				expect(screen.getByRole('checkbox', { name: 'Select SGT Smith, Jane' }).getAttribute('aria-checked')).toBe(
					'false'
				);
			await submitBulkSelection();
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
			expect(submittedIds(fetchMock)).toEqual([['person-1', 'person-2'], ['person-2']]);
		}
	);

	it('removes acknowledged IDs before refresh and reports readback failure without repeating completed archives', async () => {
		personnelStore.load([personnel[0], makePerson(2)], 'org-1');
		const refresh = deferred<void>();
		invalidateMock.mockReturnValueOnce(refresh.promise);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				batchResponse({
					archivedIds: ['person-1'],
					approvalRequestedIds: [],
					errors: [{ id: 'person-2', message: 'blocked' }]
				})
			)
			.mockResolvedValueOnce(batchResponse({ archivedIds: ['person-2'], approvalRequestedIds: [], errors: [] }));
		vi.stubGlobal('fetch', fetchMock);
		render(PersonnelPageView, { props: { ctx: archiveCtx() } });
		await selectBulkPersonnel(['Select SGT Smith, Jane', 'Select SGT Soldier002, Test']);
		await submitBulkSelection();
		await waitFor(() => expect(invalidateMock).toHaveBeenCalledExactlyOnceWith('app:personnel-data'));
		expect(screen.queryByText('Smith, Jane')).toBeNull();
		expect(screen.getByRole('checkbox', { name: 'Select SGT Soldier002, Test' }).getAttribute('aria-checked')).toBe(
			'true'
		);
		expect(archiveButton()).toHaveProperty('disabled', true);
		refresh.reject(new Error('refresh unavailable'));
		await waitFor(() => expect(toastWarningMock).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(archiveButton()).toHaveProperty('disabled', false));
		await submitBulkSelection();
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(submittedIds(fetchMock)).toEqual([['person-1', 'person-2'], ['person-2']]);
	});

	it('keeps an acknowledged approval target active and out of selection when refresh fails', async () => {
		invalidateMock.mockRejectedValueOnce(new Error('readback unavailable'));
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(batchResponse({ archivedIds: [], approvalRequestedIds: ['person-1'], errors: [] }))
		);
		render(PersonnelPageView, { props: { ctx: archiveCtx() } });
		await selectBulkPersonnel(['Select SGT Smith, Jane']);
		await submitBulkSelection();
		await waitFor(() => expect(toastWarningMock).toHaveBeenCalledTimes(1));
		expect(toastInfoMock).toHaveBeenCalledTimes(1);
		expect(toastErrorMock).not.toHaveBeenCalled();
		expect(screen.getByText('Smith, Jane')).toBeTruthy();
		expect(screen.queryByRole('toolbar', { name: 'Selected people' })).toBeNull();
	});

	it.each(['success', 'response', 'transport'] as const)(
		'discards a held %s outcome after disposal and preserves another Organization’s pending selection',
		async (outcome) => {
			const oldRequest = deferred<ReturnType<typeof batchResponse>>();
			const newRequest = deferred<ReturnType<typeof batchResponse>>();
			const fetchMock = vi.fn().mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
			vi.stubGlobal('fetch', fetchMock);
			const oldView = render(PersonnelPageView, { props: { ctx: archiveCtx() } });
			await selectBulkPersonnel(['Select SGT Smith, Jane']);
			await submitBulkSelection();
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
			oldView.unmount();
			personnelStore.load([personnel[0]], 'org-2');
			render(PersonnelPageView, { props: { ctx: archiveCtx('org-2') } });
			await selectBulkPersonnel(['Select SGT Smith, Jane']);
			await submitBulkSelection();
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
			if (outcome === 'transport') oldRequest.reject(new Error('old transport failed'));
			else
				oldRequest.resolve(
					outcome === 'response'
						? { ok: false, json: async () => null }
						: batchResponse({ archivedIds: ['person-1'], approvalRequestedIds: [], errors: [] })
				);
			// The next event loop turn lets the held continuation finish without a timing assertion.
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(invalidateMock).not.toHaveBeenCalled();
			expect(toastSuccessMock).not.toHaveBeenCalled();
			expect(toastInfoMock).not.toHaveBeenCalled();
			expect(toastErrorMock).not.toHaveBeenCalled();
			expect(toastWarningMock).not.toHaveBeenCalled();
			expect(personnelStore.getById('person-1')).toBeTruthy();
			const currentDialog = screen.getByRole('alertdialog');
			expect(within(currentDialog).getByRole('button', { name: /Archive/ })).toHaveProperty('disabled', true);
			newRequest.resolve(batchResponse({ archivedIds: [], approvalRequestedIds: ['person-1'], errors: [] }));
			await waitFor(() => expect(toastInfoMock).toHaveBeenCalledTimes(1));
			expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
				'/org/org-1/api/personnel/archive-batch',
				'/org/org-2/api/personnel/archive-batch'
			]);
		}
	);

	it('does not report an old refresh failure after the acknowledged operation’s view is disposed', async () => {
		const refresh = deferred<void>();
		invalidateMock.mockReturnValueOnce(refresh.promise);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(batchResponse({ archivedIds: [], approvalRequestedIds: ['person-1'], errors: [] }))
		);
		const oldView = render(PersonnelPageView, { props: { ctx: archiveCtx() } });
		await selectBulkPersonnel(['Select SGT Smith, Jane']);
		await submitBulkSelection();
		await waitFor(() => expect(invalidateMock).toHaveBeenCalledExactlyOnceWith('app:personnel-data'));
		expect(toastInfoMock).toHaveBeenCalledTimes(1);
		oldView.unmount();
		personnelStore.load([personnel[0]], 'org-2');
		render(PersonnelPageView, { props: { ctx: archiveCtx('org-2') } });
		await selectBulkPersonnel(['Select SGT Smith, Jane']);
		refresh.reject(new Error('old readback failed'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(toastWarningMock).not.toHaveBeenCalled();
		expect(toastErrorMock).not.toHaveBeenCalled();
		expect(screen.getByRole('checkbox', { name: 'Select SGT Smith, Jane' }).getAttribute('aria-checked')).toBe('true');
	});

	it('suppresses late feedback and mutation when the current Organization changes before a held response completes', async () => {
		const request = deferred<ReturnType<typeof batchResponse>>();
		const fetchMock = vi.fn().mockReturnValue(request.promise);
		vi.stubGlobal('fetch', fetchMock);
		const view = render(PersonnelPageView, { props: { ctx: archiveCtx() } });
		await selectBulkPersonnel(['Select SGT Smith, Jane']);
		await submitBulkSelection();
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		await view.rerender({ ctx: archiveCtx('org-2') });
		request.resolve(batchResponse({ archivedIds: ['person-1'], approvalRequestedIds: [], errors: [] }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(personnelStore.getById('person-1')).toBeTruthy();
		expect(toastSuccessMock).not.toHaveBeenCalled();
		expect(invalidateMock).not.toHaveBeenCalled();
	});
});
