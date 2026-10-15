// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { pinnedGroupsHydration } from '$features/personnel';
import type { Personnel } from '../personnel.types';
import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
import type { UpcomingLossRecord } from '$features/personnel/contracts';
import type { ClientAffordance } from '$lib/access/clientAccess';
import type { RequestPersonnelArchiveApproval } from '../utils/archivePersonnel';
import { openToolbarMore, stubToolbarWidths } from '$lib/test-support/toolbarWidths';

const requestArchiveApproval: RequestPersonnelArchiveApproval = async () => false;

const { gotoMock, invalidateAllMock, toastSuccessMock, toastInfoMock, toastErrorMock, toastWarningMock } = vi.hoisted(
	() => ({
		gotoMock: vi.fn(),
		invalidateAllMock: vi.fn(),
		toastSuccessMock: vi.fn(),
		toastInfoMock: vi.fn(),
		toastErrorMock: vi.fn(),
		toastWarningMock: vi.fn()
	})
);

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidateAll: invalidateAllMock
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
	return {
		...makeCtx(),
		orgId,
		canArchivePersonnelRecord: () => true,
		personnelArchiveAffordance: () => allowedAffordance()
	} as unknown as PersonnelPageContext;
}

function batchResponse(result: unknown) {
	return { ok: true, json: async () => result };
}

function submittedIds(fetchMock: ReturnType<typeof vi.fn>): string[][] {
	return fetchMock.mock.calls.map((call) => JSON.parse(String(call[1].body)).ids);
}

async function selectBulkPersonnel(labels: string[]) {
	await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
	for (const name of labels) await fireEvent.click(screen.getByRole('checkbox', { name }));
}

async function submitBulkSelection() {
	await fireEvent.click(screen.getByRole('button', { name: 'Confirm Archive' }));
	await confirmArchiveDialog();
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

function makeCtx(
	handleEdit = vi.fn(),
	upcomingLossMap: Map<string, UpcomingLossRecord> = new Map()
): PersonnelPageContext {
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

	const ctx = {
		data: { orgId: 'org-1' },
		orgId: 'org-1',
		canAddPersonnel: false,
		canImportPersonnel: false,
		canManageGroups: false,
		canViewRoster: true,
		canManagePersonnelRecord: () => false,
		canArchivePersonnelRecord: () => false,
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
		handleEdit,
		handleAdd: vi.fn(),
		openGroupManager: vi.fn()
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
		invalidateAllMock.mockReset();
		toastSuccessMock.mockReset();
		toastInfoMock.mockReset();
		toastErrorMock.mockReset();
		toastWarningMock.mockReset();
	});

	afterEach(() => {
		cleanup();
		personnelStore.load([], 'org-test-reset');
		pinnedGroupsHydration.load([], 'org-test-reset');
		vi.unstubAllGlobals();
	});

	it('uses Duty Role as the roster column header', () => {
		const ctx = makeCtx();

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		expect(screen.getByRole('columnheader', { name: 'Duty Role' })).toBeTruthy();
	});

	it('shows roster sorting and search controls', () => {
		const ctx = makeCtx();

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		const toolbar = within(screen.getByRole('toolbar', { name: 'Personnel controls' }));
		expect(toolbar.getByRole('group', { name: 'Roster sort mode' })).toBeTruthy();
		expect(toolbar.getByRole('searchbox', { name: 'Search by name, rank, MOS, role, or group' })).toBeTruthy();
	});

	it('keeps primary personnel actions visible in the floating toolbar for editors', () => {
		const ctx = {
			...makeCtx(),
			canAddPersonnel: true,
			canImportPersonnel: true,
			canManageGroups: true,
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Personnel controls' });
		expect(within(toolbar).getByRole('button', { name: 'Manage Groups' })).toBeTruthy();
		expect(within(toolbar).getByRole('button', { name: 'Add Person' })).toBeTruthy();
		expect(within(toolbar).getByRole('link', { name: 'Import' })).toBeTruthy();
		expect(within(toolbar).queryByRole('button', { name: 'Bulk Import' })).toBeNull();
	});

	it('links import to the dedicated personnel import route', () => {
		const ctx = {
			...makeCtx(),
			canImportPersonnel: true
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		expect(screen.getByRole('link', { name: 'Import' }).getAttribute('href')).toBe('/org/org-1/personnel/import');
	});

	it('keeps creation and group controls hidden for operators who can edit existing personnel', () => {
		const ctx = {
			...makeCtx(),
			canAddPersonnel: false,
			canImportPersonnel: false,
			canManageGroups: false,
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Personnel controls' });
		expect(within(toolbar).queryByRole('button', { name: 'Manage Groups' })).toBeNull();
		expect(within(toolbar).queryByRole('button', { name: 'Add Person' })).toBeNull();
		expect(within(toolbar).queryByRole('link', { name: 'Import' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Details' })).toBeTruthy();
	});

	it('keeps archive access available without create or import permission', async () => {
		const ctx = {
			...makeCtx(),
			canAddPersonnel: false,
			canImportPersonnel: false,
			canManageGroups: false,
			canArchivePersonnelRecord: () => true,
			personnelArchiveAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Personnel controls' });
		expect(within(toolbar).queryByRole('link', { name: 'Import' })).toBeNull();
		expect(within(toolbar).queryByRole('button', { name: 'Add Person' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Archive SGT Smith, Jane' })).toBeTruthy();

		await fireEvent.click(within(toolbar).getByRole('button', { name: 'Archive' }));
		expect(screen.getByText('0 of 1 selected')).toBeTruthy();
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
			props: { ctx, requestArchiveApproval }
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
			props: { ctx, requestArchiveApproval }
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

		it('keeps Add Person on the row and runs the view switch, Manage Groups and Archive from More', async () => {
			const widths = stubToolbarWidths();
			const ctx = editorCtx();
			render(PersonnelPageView, { props: { ctx, requestArchiveApproval } });
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
			await waitFor(() => expect(ctx.openGroupManager).toHaveBeenCalledTimes(1));

			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			menu = await openToolbarMore(toolbarName);
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Archive' }));
			expect(await screen.findByText('0 of 1 selected')).toBeTruthy();
		});

		it('opens the import route when Import is chosen from More', async () => {
			const widths = stubToolbarWidths();
			render(PersonnelPageView, { props: { ctx: editorCtx(), requestArchiveApproval } });
			await widths.foldAll();

			const menu = await openToolbarMore(toolbarName);
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Import' }));

			await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/org/org-1/personnel/import'));
		});

		it('keeps actions a roster viewer may not use out of More', async () => {
			const widths = stubToolbarWidths();
			render(PersonnelPageView, { props: { ctx: makeCtx(), requestArchiveApproval } });
			await widths.foldAll();

			const menu = await openToolbarMore(toolbarName);
			expect(within(menu).getByRole('group', { name: 'Roster sort mode' })).toBeTruthy();
			for (const name of ['Manage Groups', 'Archive', 'Import', 'Add Person']) {
				expect(within(menu).queryByRole('menuitem', { name })).toBeNull();
			}
			expect(screen.queryByRole('button', { name: 'Add Person' })).toBeNull();
		});

		it('selects and clears archive rows from the folded bulk archive toolbar and blocks Confirm Archive until one is chosen', async () => {
			const widths = stubToolbarWidths();
			render(PersonnelPageView, { props: { ctx: archiveCtx(), requestArchiveApproval } });
			await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
			await widths.foldAll();

			const bulk = within(screen.getByRole('toolbar', { name: 'Bulk archive controls' }));
			expect(bulk.queryByRole('button', { name: 'Select shown' })).toBeNull();
			const confirm = bulk.getByRole('button', { name: 'Confirm Archive' });
			expect(confirm.hasAttribute('disabled')).toBe(true);

			let menu = await openToolbarMore('Bulk archive controls');
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Select shown' }));
			expect(await screen.findByText('1 of 1 selected')).toBeTruthy();
			expect(confirm.hasAttribute('disabled')).toBe(false);

			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			menu = await openToolbarMore('Bulk archive controls');
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Clear' }));
			expect(await screen.findByText('0 of 1 selected')).toBeTruthy();

			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			menu = await openToolbarMore('Bulk archive controls');
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Cancel' }));
			await waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Bulk archive controls' })).toBeNull());
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
			props: { ctx, requestArchiveApproval }
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
		render(PersonnelPageView, { props: { ctx, requestArchiveApproval } });

		expect(screen.getByRole('status').textContent).toContain(
			'Loss warnings could not be loaded, so ETS and PCS flags are not shown.'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));
		expect(reload).toHaveBeenCalledOnce();
	});

	describe('upcoming-loss indicators', () => {
		it('shows a loss indicator chip for personnel in the upcoming-loss map', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'ETS' })]]);
			const ctx = {
				...makeCtx(vi.fn(), lossMap),
				canManagePersonnelRecord: () => true,
				personnelRecordAffordance: () => allowedAffordance()
			} as unknown as PersonnelPageContext;

			render(PersonnelPageView, {
				props: { ctx, requestArchiveApproval }
			});

			// The ETS chip should appear in the roster row
			expect(screen.getByTestId('loss-indicator-person-1')).toBeTruthy();
		});

		it('shows the correct trigger type label for an ETS indicator', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'ETS' })]]);
			const ctx = makeCtx(vi.fn(), lossMap);

			render(PersonnelPageView, {
				props: { ctx, requestArchiveApproval }
			});

			expect(screen.getByTestId('loss-indicator-person-1').textContent).toBe('ETS');
		});

		it('shows PCS label for a PCS / DEROS indicator', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'PCS / DEROS' })]]);
			const ctx = makeCtx(vi.fn(), lossMap);

			render(PersonnelPageView, {
				props: { ctx, requestArchiveApproval }
			});

			expect(screen.getByTestId('loss-indicator-person-1').textContent).toBe('PCS');
		});

		it('does not show a loss indicator for personnel not in the upcoming-loss map', () => {
			// Empty map — person-1 is not approaching any loss
			const ctx = makeCtx(vi.fn(), new Map());

			render(PersonnelPageView, {
				props: { ctx, requestArchiveApproval }
			});

			expect(screen.queryByTestId('loss-indicator-person-1')).toBeNull();
		});

		it('does not show an award acknowledgement action when the loss indicator is present', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'ETS' })]]);
			const ctx = {
				...makeCtx(vi.fn(), lossMap),
				canManagePersonnelRecord: () => true,
				personnelRecordAffordance: () => allowedAffordance()
			} as unknown as PersonnelPageContext;

			render(PersonnelPageView, {
				props: { ctx, requestArchiveApproval }
			});

			expect(screen.getByTestId('loss-indicator-person-1')).toBeTruthy();
			expect(screen.queryByTestId('award-ack-action-person-1')).toBeNull();
			expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
		});

		it('does not show an award acknowledgement action for personnel outside the upcoming-loss window', () => {
			const ctx = makeCtx(vi.fn(), new Map());

			render(PersonnelPageView, {
				props: { ctx, requestArchiveApproval }
			});

			expect(screen.queryByTestId('award-ack-action-person-1')).toBeNull();
		});
	});

	it('updates personnel row edit affordances when permissions change after render', async () => {
		const handleEdit = vi.fn();
		const editableCtx = {
			...makeCtx(handleEdit),
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;
		const viewOnlyCtx = {
			...makeCtx(handleEdit),
			canManagePersonnelRecord: () => false,
			personnelRecordAffordance: () => deniedAffordance()
		} as unknown as PersonnelPageContext;
		const view = render(PersonnelPageView, {
			props: {
				requestArchiveApproval,
				ctx: editableCtx
			}
		});

		expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
		handleEdit.mockClear();

		await view.rerender({
			requestArchiveApproval,
			ctx: viewOnlyCtx
		});

		expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();

		const row = screen.getByText('Smith, Jane').closest('tr');
		expect(row).toBeTruthy();
		await fireEvent.click(row!);

		expect(handleEdit).not.toHaveBeenCalled();
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('opens the personnel detail page from row clicks and keeps edit as a modal action', async () => {
		const handleEdit = vi.fn();
		const ctx = {
			...makeCtx(handleEdit),
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		const row = screen.getByText('Smith, Jane').closest('tr');
		expect(row).toBeTruthy();
		await fireEvent.click(row!);

		expect(gotoMock).toHaveBeenCalledWith('/org/org-1/personnel/smith-jane');
		expect(handleEdit).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		expect(handleEdit).toHaveBeenCalledWith(personnel[0]);
		expect(gotoMock).toHaveBeenCalledTimes(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Details' }));
		expect(gotoMock).toHaveBeenCalledTimes(2);
		expect(gotoMock).toHaveBeenLastCalledWith('/org/org-1/personnel/smith-jane');
	});

	it('uses per-record policy affordances instead of legacy canEditPersonnel for edit actions', () => {
		const ctx = {
			...makeCtx(),
			canManagePersonnelRecord: (person: Personnel) => person.id === 'person-1',
			personnelRecordAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
	});

	it('archives personnel from a roster icon action after confirmation', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ success: true })
		});
		vi.stubGlobal('fetch', fetchMock);
		const ctx = {
			...makeCtx(),
			canManagePersonnelRecord: () => true,
			canArchivePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance(),
			personnelArchiveAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Archive SGT Smith, Jane' }));
		await confirmArchiveDialog();

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'person-1' })
			})
		);
		await waitFor(() => expect(invalidateAllMock).toHaveBeenCalled());
		expect(screen.queryByText('Smith, Jane')).toBeNull();
	});

	it('archives selected personnel from roster archive mode after confirmation', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ archivedIds: ['person-1'], approvalRequestedIds: [], errors: [] })
		});
		vi.stubGlobal('fetch', fetchMock);
		const ctx = {
			...makeCtx(),
			canArchivePersonnelRecord: () => true,
			personnelArchiveAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SGT Smith, Jane' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm Archive' }));
		await confirmArchiveDialog();

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/archive-batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: ['person-1'] })
			})
		);
		await waitFor(() => expect(invalidateAllMock).toHaveBeenCalled());
		expect(screen.queryByText('Smith, Jane')).toBeNull();
	});

	it('offers Select shown only once the paused grouped roster gives way to the A-Z view', async () => {
		personnelStore.load(
			Array.from({ length: 251 }, (_, index) => makePerson(index + 1)),
			'org-1'
		);
		const ctx = Object.assign(makeCtx(), {
			canArchivePersonnelRecord: () => true,
			personnelArchiveAffordance: () => allowedAffordance()
		}) as unknown as PersonnelPageContext;
		ctx.viewMode = 'by-group';

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		expect(screen.getByText('Grouped roster paused')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
		const bulk = within(screen.getByRole('toolbar', { name: 'Bulk archive controls' }));
		expect(bulk.queryByRole('button', { name: 'Select shown' })).toBeNull();
		expect(bulk.getByRole('button', { name: 'Clear' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Use A-Z View' }));
		await fireEvent.click(bulk.getByRole('button', { name: 'Select shown' }));
		expect(screen.getByText('75 of 251 selected')).toBeTruthy();
	});

	it('selects only the current A-Z page when selecting shown archive rows', async () => {
		const roster = Array.from({ length: 76 }, (_, index) => makePerson(index + 1));
		personnelStore.load(roster, 'org-1');
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					archivedIds: roster.slice(0, 75).map((person) => person.id),
					approvalRequestedIds: [],
					errors: []
				})
		});
		vi.stubGlobal('fetch', fetchMock);
		const ctx = {
			...makeCtx(),
			totalPersonnel: roster.length,
			canArchivePersonnelRecord: () => true,
			personnelArchiveAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Select shown' }));
		expect(screen.getByText('75 of 76 selected')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm Archive' }));
		await confirmArchiveDialog();

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/archive-batch', expect.any(Object))
		);
		const archiveCall = fetchMock.mock.calls.find(([url]) => url === '/org/org-1/api/personnel/archive-batch');
		expect(archiveCall).toBeDefined();
		const request = JSON.parse(String(archiveCall?.[1]?.body)) as { ids: string[] };
		expect(request.ids).toHaveLength(75);
		expect(request.ids).toContain('person-1');
		expect(request.ids).not.toContain('person-76');
	});

	it('shows an approval-request toast for selected personnel that need admin approval', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ archivedIds: [], approvalRequestedIds: ['person-1'], errors: [] })
		});
		vi.stubGlobal('fetch', fetchMock);
		const ctx = {
			...makeCtx(),
			canArchivePersonnelRecord: () => true,
			personnelArchiveAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SGT Smith, Jane' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm Archive' }));
		await confirmArchiveDialog();

		await waitFor(() =>
			expect(toastInfoMock).toHaveBeenCalledWith('1 archival requests submitted for admin approval.', {
				duration: 4000,
				action: undefined
			})
		);
		expect(toastSuccessMock).not.toHaveBeenCalled();
		expect(toastErrorMock).not.toHaveBeenCalled();
		expect(invalidateAllMock).toHaveBeenCalled();
		expect(screen.getByText('Smith, Jane')).toBeTruthy();
	});

	it('shows an error toast when selected personnel cannot be archived', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					archivedIds: [],
					approvalRequestedIds: [],
					errors: [{ id: 'person-1', message: 'Archive failed' }]
				})
		});
		vi.stubGlobal('fetch', fetchMock);
		const ctx = {
			...makeCtx(),
			canArchivePersonnelRecord: () => true,
			personnelArchiveAffordance: () => allowedAffordance()
		} as unknown as PersonnelPageContext;

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SGT Smith, Jane' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm Archive' }));
		await confirmArchiveDialog();

		await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
		expect(toastSuccessMock).not.toHaveBeenCalled();
		expect(toastInfoMock).not.toHaveBeenCalled();
		expect(invalidateAllMock).not.toHaveBeenCalled();
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
			render(PersonnelPageView, { props: { ctx: archiveCtx(), requestArchiveApproval } });
			await selectBulkPersonnel(['Select SGT Smith, Jane']);
			await submitBulkSelection();
			await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
			expect(screen.getByRole('checkbox', { name: 'Select SGT Smith, Jane' }).getAttribute('aria-checked')).toBe(
				'true'
			);
			expect(screen.getByText('Smith, Jane')).toBeTruthy();
			expect(invalidateAllMock).not.toHaveBeenCalled();
			expect(toastSuccessMock).not.toHaveBeenCalled();
			expect(toastInfoMock).not.toHaveBeenCalled();
			expect(fetchMock).toHaveBeenCalledTimes(1);
			await submitBulkSelection();
			await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1));
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(submittedIds(fetchMock)).toEqual([['person-1'], ['person-1']]);
		}
	);

	it.each(['archived', 'approval'] as const)(
		'retries only the failed target after a partial %s acknowledgement and same-Organization context refresh',
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
			const view = render(PersonnelPageView, { props: { ctx: archiveCtx(), requestArchiveApproval } });
			invalidateAllMock.mockImplementationOnce(async () => {
				await view.rerender({ ctx: archiveCtx(), requestArchiveApproval });
			});
			await selectBulkPersonnel(['Select SGT Smith, Jane', 'Select SGT Soldier002, Test']);
			await submitBulkSelection();
			await waitFor(() => expect(outcome === 'archived' ? toastSuccessMock : toastInfoMock).toHaveBeenCalledTimes(1));
			await waitFor(() => expect(invalidateAllMock).toHaveBeenCalledTimes(1));
			await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
			await waitFor(() =>
				expect(screen.getByRole('button', { name: 'Confirm Archive' })).toHaveProperty('disabled', false)
			);
			expect(screen.getByRole('checkbox', { name: 'Select SGT Soldier002, Test' }).getAttribute('aria-checked')).toBe(
				'true'
			);
			if (outcome === 'archived') expect(screen.queryByText('Smith, Jane')).toBeNull();
			else {
				expect(screen.getByText('Smith, Jane')).toBeTruthy();
				expect(screen.getByRole('checkbox', { name: 'Select SGT Smith, Jane' }).getAttribute('aria-checked')).toBe(
					'false'
				);
			}
			expect(fetchMock).toHaveBeenCalledTimes(1);
			await submitBulkSelection();
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
			expect(submittedIds(fetchMock)).toEqual([['person-1', 'person-2'], ['person-2']]);
		}
	);

	it.each(['approval', 'archived'] as const)(
		'keeps a failed ID retryable when refreshed rows omit it after another target’s %s acknowledgement',
		async (outcome) => {
			personnelStore.load([personnel[0], makePerson(2)], 'org-1');
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(
					batchResponse({
						archivedIds: outcome === 'archived' ? ['person-2'] : [],
						approvalRequestedIds: outcome === 'approval' ? ['person-2'] : [],
						errors: [{ id: 'person-1', message: 'source effect persisted before command failure' }]
					})
				)
				.mockResolvedValueOnce(batchResponse({ archivedIds: ['person-1'], approvalRequestedIds: [], errors: [] }));
			vi.stubGlobal('fetch', fetchMock);
			const view = render(PersonnelPageView, { props: { ctx: archiveCtx(), requestArchiveApproval } });
			invalidateAllMock.mockImplementationOnce(async () => {
				personnelStore.load(outcome === 'approval' ? [makePerson(2)] : [], 'org-1');
				await view.rerender({ ctx: archiveCtx(), requestArchiveApproval });
			});
			await selectBulkPersonnel(['Select SGT Smith, Jane', 'Select SGT Soldier002, Test']);
			await submitBulkSelection();
			await waitFor(() => expect(outcome === 'archived' ? toastSuccessMock : toastInfoMock).toHaveBeenCalledTimes(1));
			await waitFor(() => expect(invalidateAllMock).toHaveBeenCalledTimes(1));
			await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
			await waitFor(() =>
				expect(screen.getByRole('button', { name: 'Confirm Archive' })).toHaveProperty('disabled', false)
			);
			expect(screen.queryByText('Smith, Jane')).toBeNull();
			if (outcome === 'approval') {
				expect(screen.getByText('1 of 1 selected')).toBeTruthy();
				expect(screen.getByRole('checkbox', { name: 'Select SGT Soldier002, Test' }).getAttribute('aria-checked')).toBe(
					'false'
				);
			} else expect(screen.getByText(/^1 selected/)).toBeTruthy();
			expect(fetchMock).toHaveBeenCalledTimes(1);
			await submitBulkSelection();
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
			expect(submittedIds(fetchMock)).toEqual([['person-1', 'person-2'], ['person-1']]);
		}
	);

	it('removes acknowledged IDs before refresh and reports readback failure without repeating completed archives', async () => {
		personnelStore.load([personnel[0], makePerson(2)], 'org-1');
		const refresh = deferred<void>();
		invalidateAllMock.mockReturnValueOnce(refresh.promise);
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
		render(PersonnelPageView, { props: { ctx: archiveCtx(), requestArchiveApproval } });
		await selectBulkPersonnel(['Select SGT Smith, Jane', 'Select SGT Soldier002, Test']);
		await submitBulkSelection();
		await waitFor(() => expect(invalidateAllMock).toHaveBeenCalledTimes(1));
		expect(screen.queryByText('Smith, Jane')).toBeNull();
		const retained = screen.getByRole('checkbox', { name: 'Select SGT Soldier002, Test' });
		expect(retained.getAttribute('aria-checked')).toBe('true');
		expect(retained).toHaveProperty('disabled', true);
		expect(screen.getByRole('button', { name: 'Confirm Archive' })).toHaveProperty('disabled', true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		refresh.reject(new Error('refresh unavailable'));
		await waitFor(() => expect(toastWarningMock).toHaveBeenCalledTimes(1));
		await submitBulkSelection();
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(submittedIds(fetchMock)).toEqual([['person-1', 'person-2'], ['person-2']]);
	});

	it('keeps an acknowledged approval target active and out of selection when refresh fails', async () => {
		invalidateAllMock.mockRejectedValueOnce(new Error('readback unavailable'));
		const fetchMock = vi
			.fn()
			.mockResolvedValue(batchResponse({ archivedIds: [], approvalRequestedIds: ['person-1'], errors: [] }));
		vi.stubGlobal('fetch', fetchMock);
		render(PersonnelPageView, { props: { ctx: archiveCtx(), requestArchiveApproval } });
		await selectBulkPersonnel(['Select SGT Smith, Jane']);
		await submitBulkSelection();
		await waitFor(() => expect(toastWarningMock).toHaveBeenCalledTimes(1));
		expect(toastInfoMock).toHaveBeenCalledTimes(1);
		expect(toastErrorMock).not.toHaveBeenCalled();
		expect(screen.getByText('Smith, Jane')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Confirm Archive' })).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each(['success', 'response', 'transport'] as const)(
		'discards a held %s outcome after disposal and preserves another Organization’s pending selection',
		async (outcome) => {
			const oldRequest = deferred<ReturnType<typeof batchResponse>>();
			const newRequest = deferred<ReturnType<typeof batchResponse>>();
			const fetchMock = vi.fn().mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
			vi.stubGlobal('fetch', fetchMock);
			const oldView = render(PersonnelPageView, { props: { ctx: archiveCtx(), requestArchiveApproval } });
			await selectBulkPersonnel(['Select SGT Smith, Jane']);
			await submitBulkSelection();
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
			oldView.unmount();
			personnelStore.load([personnel[0]], 'org-2');
			render(PersonnelPageView, { props: { ctx: archiveCtx('org-2'), requestArchiveApproval } });
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
			expect(invalidateAllMock).not.toHaveBeenCalled();
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
		invalidateAllMock.mockReturnValueOnce(refresh.promise);
		const fetchMock = vi
			.fn()
			.mockResolvedValue(batchResponse({ archivedIds: [], approvalRequestedIds: ['person-1'], errors: [] }));
		vi.stubGlobal('fetch', fetchMock);
		const oldView = render(PersonnelPageView, { props: { ctx: archiveCtx(), requestArchiveApproval } });
		await selectBulkPersonnel(['Select SGT Smith, Jane']);
		await submitBulkSelection();
		await waitFor(() => expect(invalidateAllMock).toHaveBeenCalledTimes(1));
		expect(toastInfoMock).toHaveBeenCalledTimes(1);
		oldView.unmount();
		personnelStore.load([personnel[0]], 'org-2');
		render(PersonnelPageView, { props: { ctx: archiveCtx('org-2'), requestArchiveApproval } });
		await selectBulkPersonnel(['Select SGT Smith, Jane']);
		refresh.reject(new Error('old readback failed'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(toastWarningMock).not.toHaveBeenCalled();
		expect(toastErrorMock).not.toHaveBeenCalled();
		expect(invalidateAllMock).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('checkbox', { name: 'Select SGT Smith, Jane' }).getAttribute('aria-checked')).toBe('true');
	});

	it('suppresses late feedback and mutation when the current Organization changes before a held response completes', async () => {
		const request = deferred<ReturnType<typeof batchResponse>>();
		const fetchMock = vi.fn().mockReturnValue(request.promise);
		vi.stubGlobal('fetch', fetchMock);
		const view = render(PersonnelPageView, { props: { ctx: archiveCtx(), requestArchiveApproval } });
		await selectBulkPersonnel(['Select SGT Smith, Jane']);
		await submitBulkSelection();
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		await view.rerender({ ctx: archiveCtx('org-2'), requestArchiveApproval });
		request.resolve(batchResponse({ archivedIds: ['person-1'], approvalRequestedIds: [], errors: [] }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(personnelStore.getById('person-1')).toBeTruthy();
		expect(toastSuccessMock).not.toHaveBeenCalled();
		expect(invalidateAllMock).not.toHaveBeenCalled();
	});

	it('keeps rating scheme controls out of the Personnel roster page', () => {
		const ctx = makeCtx();

		render(PersonnelPageView, {
			props: { ctx, requestArchiveApproval }
		});

		expect(screen.queryByRole('button', { name: 'Rating Scheme' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Add Entry' })).toBeNull();
	});
});
