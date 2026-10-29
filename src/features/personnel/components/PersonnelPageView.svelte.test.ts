// @vitest-environment happy-dom
import { flushSync } from 'svelte';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupCatalogHydration, groupsStore, pinnedGroupsHydration, pinnedGroupsStore } from '$features/personnel';
import { buildGroupTree, soleLeafGroup } from '../groupTree';
import { SvelteSet } from 'svelte/reactivity';
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

vi.mock('$lib/utils/browserStorage', () => ({ getBrowserLocalStorage: () => globalThis.localStorage }));
vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	beforeNavigate: beforeNavigateMock,
	invalidate: invalidateMock
}));

const pageMock = $state({ url: new URL('http://localhost/org/org-1/personnel') });

vi.mock('$app/state', () => ({
	page: {
		get url() {
			return pageMock.url;
		}
	}
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
import { RosterPeek } from '../rosterPeek.svelte';
import type { RosterPeekRead, RosterPeekSection } from '../rosterPeek';

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
	return makeCtx({
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

function bulkCtx(overrides: Partial<PersonnelPageContext> = {}): PersonnelPageContext {
	return makeCtx(
		{
			canManagePersonnelRecord: () => true,
			canExportPersonnelRecord: () => true,
			canArchivePersonnelRecord: () => true,
			canManagePersonnelInGroup: () => true,
			personnelRecordAffordance: () => allowedAffordance(),
			personnelArchiveAffordance: () => allowedAffordance()
		},
		overrides
	);
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

function makeCtx(...overrides: Partial<PersonnelPageContext>[]): PersonnelPageContext {
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
		peek: new RosterPeek('org-1', { readSection: () => new Promise<never>(() => {}) }),
		lossesEnabled: true,
		expectedChipCount: 4,
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
		groupOrder: [
			{ id: 'group-1', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const },
			{ id: 'group-2', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 as const }
		],
		canPinGroups: true,
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
		upcomingLossMap: new Map<string, UpcomingLossRecord>(),
		handleAdd: vi.fn(),
		openGroupEditor: vi.fn(),
		collapsedGroups: new SvelteSet<string>(),
		toggleGroup(key: string): void {
			if (!ctx.collapsedGroups.delete(key)) ctx.collapsedGroups.add(key);
		},
		get groupTree() {
			return buildGroupTree(groupsStore.orgId === ctx.orgId ? groupsStore.items : [], {
				pinnedIds: ctx.canPinGroups ? pinnedGroupsStore.list : []
			});
		},
		get soleLeafGroup() {
			return soleLeafGroup(ctx.groupTree, ctx.canPinGroups);
		}
	};

	for (const override of overrides) {
		Object.defineProperties(ctx, Object.getOwnPropertyDescriptors(override));
	}
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
		pageMock.url = new URL('http://localhost/org/org-1/personnel');
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
		groupCatalogHydration.load([], 'org-test-reset');
		vi.unstubAllGlobals();
	});

	it('links import to the dedicated personnel import route', () => {
		const ctx = makeCtx({ canImportPersonnel: true });

		render(PersonnelPageView, {
			props: { ctx }
		});

		expect(screen.getByRole('link', { name: 'Import' }).getAttribute('href')).toBe('/org/org-1/personnel/import');
	});

	it('opens Manage Groups on the first top-level Group when the catalog lists a sub-group first', async () => {
		groupCatalogHydration.load(
			[
				{ id: 'squad', name: '1st Squad', sortOrder: 0, parentId: 'platoon', depth: 2 },
				{ id: 'platoon', name: '2nd Platoon', sortOrder: 0, parentId: null, depth: 1 }
			],
			'org-1'
		);
		const ctx = makeCtx({ canManageGroups: true });

		render(PersonnelPageView, { props: { ctx } });
		await fireEvent.click(screen.getByRole('button', { name: 'Manage Groups' }));

		expect(ctx.openGroupEditor).toHaveBeenCalledWith('platoon');
	});

	it('keeps creation, group and detail controls hidden for operators who can edit existing personnel', async () => {
		const ctx = makeCtx({
			canAddPersonnel: false,
			canImportPersonnel: false,
			canManageGroups: false,
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		});

		render(PersonnelPageView, {
			props: { ctx }
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Personnel controls' });
		expect(within(toolbar).queryByRole('button', { name: 'Manage Groups' })).toBeNull();
		expect(within(toolbar).queryByRole('button', { name: 'Add Person' })).toBeNull();
		expect(within(toolbar).queryByRole('link', { name: 'Import' })).toBeNull();
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

	describe('nested Groups', () => {
		const person = (id: string, lastName: string, groupId: string | null, groupName: string): Personnel => ({
			...personnel[0],
			id,
			lastName,
			slug: id,
			groupId,
			groupName
		});

		beforeEach(() => {
			personnelStore.load(
				[
					person('psg', 'Diaz', 'plt', '2nd Platoon'),
					person('sl', 'Lee', 'sq1', '1st Squad'),
					person('tl', 'Moss', 'alpha', 'Alpha Team'),
					person('hq', 'Reyes', 'hq', 'HQ Section'),
					person('none', 'Adams', null, '')
				],
				'org-1'
			);
		});

		const unitCatalog = () =>
			groupCatalogHydration.load(
				[
					{ id: 'hq', name: 'HQ Section', sortOrder: 0, parentId: null, depth: 1 },
					{ id: 'plt', name: '2nd Platoon', sortOrder: 1, parentId: null, depth: 1 },
					{ id: 'sq1', name: '1st Squad', sortOrder: 0, parentId: 'plt', depth: 2 },
					{ id: 'alpha', name: 'Alpha Team', sortOrder: 0, parentId: 'sq1', depth: 3 }
				],
				'org-1'
			);
		const bands = () =>
			screen.getAllByRole('button', { name: /^(Collapse|Expand) / }).map((button) => button.getAttribute('aria-label'));
		const shownPeople = () =>
			['Diaz', 'Lee', 'Moss', 'Reyes', 'Adams'].filter((name) => screen.queryByRole('row', { name: new RegExp(name) }));

		it('lets an Organization-wide reader pin only top-level Groups', () => {
			unitCatalog();
			render(PersonnelPageView, { props: { ctx: makeCtx({ viewMode: 'by-group' }) } });

			expect(
				screen.getAllByRole('button', { name: /^(Pin|Unpin) / }).map((pin) => pin.getAttribute('aria-label'))
			).toEqual(['Pin HQ Section', 'Pin 2nd Platoon']);
		});

		it('hides every sub-group of a collapsed Group', async () => {
			unitCatalog();
			render(PersonnelPageView, { props: { ctx: makeCtx({ viewMode: 'by-group' }) } });

			await fireEvent.click(screen.getByRole('button', { name: 'Collapse 2nd Platoon' }));

			expect(bands()).toEqual(['Collapse HQ Section', 'Expand 2nd Platoon', 'Collapse Unassigned']);
		});

		it('shows an Organization-wide reader everyone, each sub-group under its parent', () => {
			unitCatalog();
			render(PersonnelPageView, { props: { ctx: makeCtx({ viewMode: 'by-group' }) } });

			expect(bands()).toEqual([
				'Collapse HQ Section',
				'Collapse 2nd Platoon',
				'Collapse 2nd Platoon › 1st Squad',
				'Collapse 2nd Platoon › 1st Squad › Alpha Team',
				'Collapse Unassigned'
			]);
			expect(shownPeople()).toEqual(['Diaz', 'Lee', 'Moss', 'Reyes', 'Adams']);
		});

		it('gives a reader whose whole roster is one Group no bands and no A-Z or Group choice', () => {
			groupCatalogHydration.load(
				[{ id: 'alpha', name: 'Alpha Team', sortOrder: 0, parentId: 'sq1', depth: 3 }],
				'org-1'
			);
			personnelStore.load([person('tl', 'Moss', 'alpha', 'Alpha Team')], 'org-1');
			render(PersonnelPageView, { props: { ctx: makeCtx({ viewMode: 'by-group', canPinGroups: false }) } });

			expect(screen.queryByRole('button', { name: /^(Collapse|Expand) / })).toBeNull();
			expect(screen.queryByRole('button', { name: 'Group' })).toBeNull();
			expect(screen.getByRole('row', { name: /Moss/ })).toBeTruthy();
		});
	});

	describe('By Group view', () => {
		function loadCatalogOrder(groupIds: string[]): void {
			const nameOf = (id: string) => personnelStore.items.find((person) => person.groupId === id)?.groupName ?? id;
			groupCatalogHydration.load(
				groupIds.map((id, sortOrder) => ({ id, name: nameOf(id), sortOrder, parentId: null, depth: 1 as const })),
				'org-1'
			);
		}

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
			loadCatalogOrder(['group-2', 'group-1']);
			const ctx = makeCtx({ viewMode: 'by-group' });

			render(PersonnelPageView, { props: { ctx } });

			expect(headerOrder()).toEqual(['Collapse Bravo', 'Collapse Alpha', 'Collapse Unassigned']);
			expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).not.toContain('Group');
		});

		it('keeps the controls of a Group named Unassigned apart from the People with no Group', () => {
			loadTwoGroups('Unassigned');
			loadCatalogOrder(['group-1', 'group-2']);
			const ctx = makeCtx({ viewMode: 'by-group', canManageGroups: true });

			render(PersonnelPageView, { props: { ctx } });

			expect(headerOrder()).toEqual(['Collapse Alpha', 'Collapse Unassigned', 'Collapse Unassigned']);
			expect(screen.getAllByRole('button', { name: 'Pin Unassigned' })).toHaveLength(1);
			expect(screen.getAllByRole('button', { name: 'Group actions for Unassigned' })).toHaveLength(1);
			expect(screen.getAllByRole('button', { name: 'Assign a Group' })).toHaveLength(1);
		});

		it("moves the viewer's pinned Group above the Organization order", () => {
			loadTwoGroups();
			loadCatalogOrder(['group-2', 'group-1']);
			pinnedGroupsHydration.load(['group-1'], 'org-1');
			const ctx = makeCtx({ viewMode: 'by-group' });

			render(PersonnelPageView, { props: { ctx } });

			expect(headerOrder()).toEqual(['Collapse Alpha', 'Collapse Bravo', 'Collapse Unassigned']);
		});

		it('gives a viewer who cannot pin no pin control', () => {
			loadTwoGroups();
			loadCatalogOrder(['group-2', 'group-1']);
			const ctx = makeCtx({ viewMode: 'by-group', canPinGroups: false });

			render(PersonnelPageView, { props: { ctx } });

			expect(headerOrder()).toEqual(['Collapse Bravo', 'Collapse Alpha', 'Collapse Unassigned']);
			expect(screen.queryByRole('button', { name: /^(Pin|Unpin) / })).toBeNull();
		});

		describe('with more People than one page holds', () => {
			const searchName = 'Search by name, rank, MOS, role, or group';
			const row = (index: number) => screen.queryByRole('row', { name: `SGT ${makePerson(index).lastName}, Test` });
			const pager = () => within(screen.getByRole('navigation', { name: 'Table pagination' }));
			const nextDisabled = () => pager().getByRole('button', { name: 'Next' }).hasAttribute('disabled');
			const groupHeaders = () =>
				screen
					.getAllByRole('button', { name: /^(Collapse|Expand) (Alpha|Bravo)$/ })
					.map((button) => button.getAttribute('aria-label'));

			function renderLargeGroupedRoster(): void {
				personnelStore.load(
					[
						...Array.from({ length: 200 }, (_, index) => makePerson(index + 1)),
						...Array.from({ length: 5 }, (_, index) => ({
							...makePerson(index + 201),
							groupId: 'group-2',
							groupName: 'Bravo'
						}))
					],
					'org-1'
				);
				render(PersonnelPageView, { props: { ctx: makeCtx({ viewMode: 'by-group' }) } });
			}

			async function choosePageSize(size: number): Promise<void> {
				await fireEvent.pointerDown(pager().getByRole('button', { name: 'Rows per page' }));
				const option = within(screen.getByRole('listbox')).getByRole('option', { name: `${size} per page` });
				await fireEvent.pointerDown(option);
				await fireEvent.pointerUp(option);
			}

			afterEach(() => localStorage.clear());

			it('pages the grouped roster in Group order, 100 rows at a time', async () => {
				renderLargeGroupedRoster();

				expect([row(1) !== null, row(100) !== null, row(101) !== null]).toEqual([true, true, false]);

				await fireEvent.click(pager().getByRole('button', { name: 'Next' }));
				await fireEvent.click(pager().getByRole('button', { name: 'Next' }));
				expect([groupHeaders(), row(200) !== null, row(205) !== null, nextDisabled()]).toEqual([
					['Collapse Bravo'],
					false,
					true,
					true
				]);
			});

			it("keeps a collapsed Group's header and gives its page space to the Groups below it", async () => {
				renderLargeGroupedRoster();

				await fireEvent.click(screen.getByRole('button', { name: 'Collapse Alpha' }));

				expect([groupHeaders(), row(1) !== null, row(201) !== null, nextDisabled()]).toEqual([
					['Expand Alpha', 'Collapse Bravo'],
					false,
					true,
					true
				]);
			});

			it('keeps the last page it showed when the roster shrank, after the roster grows back', async () => {
				renderLargeGroupedRoster();
				const everyone = [...personnelStore.items];
				await fireEvent.click(pager().getByRole('button', { name: 'Next' }));
				await fireEvent.click(pager().getByRole('button', { name: 'Next' }));

				personnelStore.load(everyone.slice(0, 200), 'org-1');
				await waitFor(() => expect(row(201)).toBeNull());
				personnelStore.load(everyone, 'org-1');
				flushSync();

				expect([row(101) !== null, row(201) !== null]).toEqual([true, false]);
			});

			it('follows a Group pinned from a later page to its new page and keeps focus on its pin', async () => {
				vi.stubGlobal(
					'fetch',
					vi.fn(async () => new Response(JSON.stringify({ groupIds: ['group-2'] })))
				);
				groupCatalogHydration.load(
					[
						{ id: 'group-1', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const },
						{ id: 'group-2', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 as const }
					],
					'org-1'
				);
				renderLargeGroupedRoster();
				await fireEvent.click(pager().getByRole('button', { name: 'Next' }));
				await fireEvent.click(pager().getByRole('button', { name: 'Next' }));

				const pin = screen.getByRole('button', { name: 'Pin Bravo' });
				pin.focus();
				await fireEvent.click(pin);

				await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Unpin Bravo' })));
			});

			it('follows a Group collapsed from its continuation page and keeps focus on its toggle', async () => {
				personnelStore.load(
					Array.from({ length: 400 }, (_, index) => ({
						...makePerson(index + 1),
						...(index >= 200 ? { groupId: 'group-2', groupName: 'Bravo' } : {})
					})),
					'org-1'
				);
				render(PersonnelPageView, { props: { ctx: makeCtx({ viewMode: 'by-group' }) } });
				await fireEvent.click(pager().getByRole('button', { name: 'Next' }));

				const collapse = screen.getByRole('button', { name: 'Collapse Alpha' });
				collapse.focus();
				await fireEvent.click(collapse);

				await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Expand Alpha' })));
			});

			it('starts a sorted grouped roster at the first page', async () => {
				renderLargeGroupedRoster();
				await fireEvent.click(pager().getByRole('button', { name: 'Next' }));

				await fireEvent.click(screen.getByRole('button', { name: 'Sort by MOS' }));

				expect(pager().getByRole('button', { name: 'Previous' }).hasAttribute('disabled')).toBe(true);
			});

			it('searches the whole roster from the first page', async () => {
				renderLargeGroupedRoster();
				await fireEvent.click(pager().getByRole('button', { name: 'Next' }));

				await fireEvent.input(screen.getByRole('searchbox', { name: searchName }), { target: { value: 'Soldier' } });

				expect([row(1) !== null, row(101) !== null]).toEqual([true, false]);
			});

			it('shows the chosen number of rows on each page and remembers it for the next visit', async () => {
				renderLargeGroupedRoster();

				await choosePageSize(200);
				expect([row(200) !== null, row(201) !== null]).toEqual([true, false]);

				cleanup();
				renderLargeGroupedRoster();
				await waitFor(() => expect([row(200) !== null, row(201) !== null]).toEqual([true, false]));

				await choosePageSize(50);
				expect([row(50) !== null, row(51) !== null]).toEqual([true, false]);
			});
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
			return makeCtx({
				canAddPersonnel: true,
				canImportPersonnel: true,
				canManageGroups: true,
				canArchivePersonnelRecord: () => true,
				personnelArchiveAffordance: () => allowedAffordance()
			});
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
		const ctx = makeCtx({ viewMode: 'by-group' });
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
		const ctx = makeCtx({ lossWarningsUnavailable: true });
		render(PersonnelPageView, { props: { ctx } });

		expect(screen.getByRole('status').textContent).toContain('Loss warnings could not be loaded');
		await fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));
		expect(reload).toHaveBeenCalledOnce();
	});

	describe('upcoming-loss indicators', () => {
		it('shows a loss indicator chip for personnel in the upcoming-loss map', () => {
			const lossMap = new Map([['person-1', makeUpcomingLossRecord({ triggerType: 'ETS' })]]);
			const ctx = makeCtx({
				upcomingLossMap: lossMap,
				canManagePersonnelRecord: () => true,
				personnelRecordAffordance: () => allowedAffordance()
			});

			render(PersonnelPageView, {
				props: { ctx }
			});

			expect(screen.getByTestId('loss-indicator-person-1').textContent?.trim()).toBe('ETS · 78d');
		});
	});

	it('updates the row actions when permissions change after render', async () => {
		const editableCtx = makeCtx({
			canManagePersonnelRecord: () => true,
			personnelRecordAffordance: () => allowedAffordance()
		});
		const viewOnlyCtx = makeCtx({
			canManagePersonnelRecord: () => false,
			personnelRecordAffordance: () => deniedAffordance()
		});
		const view = render(PersonnelPageView, { props: { ctx: editableCtx } });

		await fireEvent.click(screen.getAllByRole('button', { name: 'Quick edit SGT Smith, Jane' })[0]);
		expect(screen.getByRole('form', { name: 'Quick edit SGT Smith, Jane' })).toBeTruthy();

		await view.rerender({ ctx: viewOnlyCtx });

		expect(screen.queryByRole('button', { name: 'Quick edit SGT Smith, Jane' })).toBeNull();
		await fireEvent.click(screen.getByRole('row', { name: 'SGT Smith, Jane' }));
		expect(gotoMock).not.toHaveBeenCalled();
	});

	function openableCtx(overrides: Partial<PersonnelPageContext> = {}): PersonnelPageContext {
		return makeCtx(
			{
				canManagePersonnelRecord: (person: Personnel) => person.id === 'person-1',
				canReadPersonnelDetails: true,
				canOpenPersonnelDetail: () => true,
				personnelRecordAffordance: () => allowedAffordance()
			},
			overrides
		);
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
			const ctx = openableCtx({ canManagePersonnelRecord: () => true });
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

		beforeEach(() =>
			groupCatalogHydration.load(
				[{ id: 'group-1', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const }],
				'org-1'
			)
		);
		afterEach(() => {
			vi.restoreAllMocks();
			groupCatalogHydration.load([], 'org-test-reset');
		});

		function editCtx(
			overrides: Partial<PersonnelPageContext> = {},
			people = [personnel[0], young]
		): PersonnelPageContext {
			personnelStore.load(people, 'org-1');
			return makeCtx(
				{
					canManagePersonnelRecord: () => true,
					canReadPersonnelDetails: true,
					canOpenPersonnelDetail: () => true,
					personnelRecordAffordance: () => allowedAffordance()
				},
				overrides
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
			expect(update).toHaveBeenCalledExactlyOnceWith('person-1', { mos: '68C', clinicRole: 'Senior Medic' });
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

	describe('peek panel', () => {
		const realMatchMedia = window.matchMedia;

		function viewport(width: number) {
			vi.stubGlobal('matchMedia', (query: string) => {
				const minWidth = Number(/min-width:\s*(\d+)px/.exec(query)?.[1]);
				if (!minWidth) return realMatchMedia.call(window, query);
				return {
					matches: width >= minWidth,
					media: query,
					addEventListener: () => {},
					removeEventListener: () => {}
				} as unknown as MediaQueryList;
			});
		}

		function peekCtx() {
			personnelStore.load(
				[personnel[0], { ...makePerson(2), lastName: 'Young', clinicRole: 'Driver', slug: 'young-test' }],
				'org-1'
			);
			const reads: { personnelId: string; section: RosterPeekSection; reply: PromiseWithResolvers<RosterPeekRead> }[] =
				[];
			const peek = new RosterPeek('org-1', {
				browseDelayMs: 0,
				readSection: (_orgId, personnelId, section) => {
					const reply = Promise.withResolvers<RosterPeekRead>();
					reads.push({ personnelId, section, reply });
					return reply.promise;
				}
			});
			const answer = async (personnelId: string, section: RosterPeekSection, read: RosterPeekRead | Error) => {
				const call = reads.findLast((entry) => entry.personnelId === personnelId && entry.section === section);
				if (read instanceof Error) call?.reply.reject(read);
				else call?.reply.resolve(read);
				await waitFor(() => {});
			};
			const ctx = makeCtx({
				peek,
				canViewAvailability: true,
				canManagePersonnelRecord: () => true,
				canReadPersonnelDetails: true,
				canOpenPersonnelDetail: () => true,
				personnelRecordAffordance: () => allowedAffordance()
			});
			return { ctx, reads, answer };
		}

		const panel = () => screen.getByRole('complementary', { name: 'Preview of SGT Jane Smith' });

		it('opens beside the roster from a row click, with the row facts at once and each section as it settles', async () => {
			viewport(1440);
			const { ctx, reads, answer } = peekCtx();
			render(PersonnelPageView, { props: { ctx } });
			expect(reads).toEqual([]);
			expect(screen.getByRole('columnheader', { name: 'Duty Role' })).toBeTruthy();

			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));

			expect(gotoMock).not.toHaveBeenCalled();
			const preview = within(panel());
			expect(preview.getByRole('heading', { name: 'SGT Jane Smith' })).toBeTruthy();
			expect(preview.getByText('Alpha · Medic')).toBeTruthy();
			expect(preview.getByText('1 of 2 · J/K')).toBeTruthy();
			expect(preview.getByLabelText('Latest note loading')).toBeTruthy();
			expect(reads.map((read) => read.section)).toEqual(['identity', 'next7', 'attention', 'followUps', 'note']);
			expect(screen.queryByRole('list', { name: "Today's headcount" })).toBeNull();

			await answer('person-1', 'identity', { state: 'ready', value: { phone: '(910) 555-0148' } });
			await answer('person-1', 'note', {
				state: 'ready',
				value: { id: 'n1', text: 'Wants BLC in January', author: 'SFC Whitaker', createdAt: '2026-09-30T15:00:00Z' }
			} as RosterPeekRead);
			await answer('person-1', 'attention', new Error('statement timeout'));

			expect(preview.getByText('(910) 555-0148')).toBeTruthy();
			expect(preview.getByText('“Wants BLC in January”')).toBeTruthy();
			expect(preview.getByText('SFC Whitaker · 30 Sep')).toBeTruthy();
			expect(preview.getByText("Couldn't load readiness.")).toBeTruthy();
			expect(preview.getByLabelText('Open follow-ups loading')).toBeTruthy();

			await fireEvent.click(preview.getByRole('button', { name: 'Retry' }));
			expect(reads.slice(5).map((read) => read.section)).toEqual(['attention']);
		});

		it('keeps the roster in its Duty Role order while the peek is open and after it closes', async () => {
			viewport(1440);
			const { ctx } = peekCtx();
			render(PersonnelPageView, { props: { ctx } });
			const order = () =>
				screen
					.getAllByRole('row')
					.map((row) => row.getAttribute('aria-label'))
					.filter((label) => label?.startsWith('Open '));
			await fireEvent.click(within(screen.getByRole('columnheader', { name: 'Duty Role' })).getByRole('button'));
			expect(order()).toEqual(['Open SGT Young, Test', 'Open SGT Smith, Jane']);

			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));
			expect(panel()).toBeTruthy();
			expect(order()).toEqual(['Open SGT Young, Test', 'Open SGT Smith, Jane']);

			await fireEvent.keyDown(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }), { key: 'Escape' });
			await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
			expect(order()).toEqual(['Open SGT Young, Test', 'Open SGT Smith, Jane']);
		});

		it('moves focus to the first shown row when Esc closes a peek whose row a search removed', async () => {
			viewport(1440);
			const { ctx } = peekCtx();
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));
			await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'Young' } });
			await waitFor(() => expect(screen.queryByRole('row', { name: 'Open SGT Smith, Jane' })).toBeNull());

			await fireEvent.keyDown(within(panel()).getByRole('button', { name: 'Close preview' }), { key: 'Escape' });

			await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
			await waitFor(() =>
				expect(document.activeElement).toBe(screen.getByRole('row', { name: 'Open SGT Young, Test' }))
			);
		});

		it('leaves out a section the viewer may not see', async () => {
			viewport(1440);
			const { ctx, answer } = peekCtx();
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));

			await answer('person-1', 'followUps', { state: 'hidden' });

			expect(within(panel()).queryByRole('region', { name: 'Open follow-ups' })).toBeNull();
			expect(within(panel()).getByRole('region', { name: 'Latest note' })).toBeTruthy();
		});

		it('opens from Space, steps with J and K while the roster keeps focus, and returns focus to the row on Esc', async () => {
			viewport(1440);
			const { ctx } = peekCtx();
			render(PersonnelPageView, { props: { ctx } });
			const smith = screen.getByRole('row', { name: 'Open SGT Smith, Jane' });
			smith.focus();

			await fireEvent.keyDown(smith, { key: ' ' });
			expect(panel()).toBeTruthy();
			expect(smith.getAttribute('aria-current')).toBe('true');

			await fireEvent.keyDown(smith, { key: 'j' });
			const young = screen.getByRole('row', { name: 'Open SGT Young, Test' });
			const youngPanel = await screen.findByRole('complementary', { name: 'Preview of SGT Test Young' });
			await waitFor(() => expect(document.activeElement).toBe(young));
			expect(within(youngPanel).getByText('2 of 2 · J/K')).toBeTruthy();

			await fireEvent.keyDown(young, { key: 'Tab' });
			expect(document.activeElement).toBe(within(youngPanel).getByRole('button', { name: 'Previous person' }));
			await fireEvent.keyDown(document.activeElement!, { key: 'k' });
			expect(await screen.findByRole('complementary', { name: 'Preview of SGT Jane Smith' })).toBeTruthy();

			await fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
			await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
			await waitFor(() => expect(document.activeElement).toBe(smith));
			expect(gotoMock).not.toHaveBeenCalled();
		});

		it("checks off a follow-up in place, then refreshes that Person's row", async () => {
			viewport(1440);
			const { ctx, answer } = peekCtx();
			const refresh = vi.spyOn(ctx.signals, 'refresh').mockResolvedValue();
			const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'completed' }), { status: 200 }));
			vi.stubGlobal('fetch', fetchMock);
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));
			await answer('person-1', 'followUps', {
				state: 'ready',
				value: {
					followUps: [
						{
							id: 'f1',
							title: 'Turn in TA-50 shortage list',
							notes: '',
							status: 'open',
							dueDate: '2026-10-02',
							createdAt: '2026-09-28T10:00:00Z',
							createdBy: 'SFC Whitaker',
							completedAt: null,
							completedBy: null
						}
					],
					total: 1
				}
			} as RosterPeekRead);
			const preview = within(panel());
			expect(preview.getByText('Overdue 4 days')).toBeTruthy();

			await fireEvent.click(preview.getByRole('checkbox', { name: 'Complete Turn in TA-50 shortage list' }));

			await waitFor(() => expect(refresh).toHaveBeenCalledExactlyOnceWith(['person-1']));
			expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
				'/org/org-1/api/personnel/person-1/follow-ups/f1',
				expect.objectContaining({ method: 'PATCH' })
			);
			expect(preview.getByRole('checkbox', { name: 'Reopen Turn in TA-50 shortage list' })).toBeTruthy();
		});

		const openFollowUp = {
			id: 'f1',
			title: 'Turn in TA-50 shortage list',
			notes: '',
			status: 'open',
			dueDate: '2026-10-02',
			createdAt: '2026-09-28T10:00:00Z',
			createdBy: 'SFC Whitaker',
			completedAt: null,
			completedBy: null
		};

		it("links the record, its readiness and its log by the Person's slug", async () => {
			viewport(1440);
			const { ctx, answer } = peekCtx();
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));
			await answer('person-1', 'followUps', { state: 'ready', value: { followUps: [], total: 0 } } as RosterPeekRead);

			const preview = within(panel());
			expect(
				['Open record', 'Readiness', 'Open log'].map((name) =>
					preview.getByRole('link', { name: new RegExp(name) }).getAttribute('href')
				)
			).toEqual([
				'/org/org-1/personnel/smith-jane',
				'/org/org-1/personnel/smith-jane/readiness',
				'/org/org-1/personnel/smith-jane/log'
			]);
		});

		it('counts the open follow-ups past the shown ones toward the log', async () => {
			viewport(1440);
			const { ctx, answer } = peekCtx();
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));
			const shown = ['f1', 'f2', 'f3', 'f4', 'f5'].map((id, index) => ({
				...openFollowUp,
				id,
				title: `Follow-up ${index + 1}`
			}));
			await answer('person-1', 'followUps', {
				state: 'ready',
				value: { followUps: shown, total: 7 }
			} as RosterPeekRead);

			const preview = within(panel());
			expect(preview.getByRole('heading', { name: /^Open follow-ups\s·\s7$/ })).toBeTruthy();
			expect(preview.getByText('+2 more in the log')).toBeTruthy();
		});

		it('offers Retry for a readiness source that could not be checked, rereading only readiness', async () => {
			viewport(1440);
			const { ctx, reads, answer } = peekCtx();
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));

			await answer('person-1', 'attention', {
				state: 'ready',
				value: {
					items: [
						{
							kind: 'loss',
							id: 'ets',
							title: 'ETS 3 Dec 2026',
							detail: 'Separation',
							status: 'upcoming',
							dueDate: '2026-12-03',
							daysUntilDue: 58,
							target: { tab: 'data-sheet' }
						}
					],
					failed: ['training', 'criticalTasks'],
					checked: {},
					readinessBadge: { count: 0, complete: false }
				}
			} as unknown as RosterPeekRead);

			const preview = within(panel());
			expect(preview.getByText('ETS 3 Dec 2026')).toBeTruthy();
			expect(preview.getByText("Couldn't check training, critical tasks.")).toBeTruthy();

			await fireEvent.click(preview.getByRole('button', { name: 'Retry' }));
			expect(reads.slice(5).map((read) => read.section)).toEqual(['attention']);
		});

		it('shows the saved follow-up when the Person is browsed away from and back to before the write finishes', async () => {
			viewport(1440);
			const { ctx, reads, answer } = peekCtx();
			const patch = Promise.withResolvers<Response>();
			vi.spyOn(ctx.signals, 'refresh').mockResolvedValue();
			vi.stubGlobal(
				'fetch',
				vi.fn(() => patch.promise)
			);
			render(PersonnelPageView, { props: { ctx } });
			const smith = screen.getByRole('row', { name: 'Open SGT Smith, Jane' });
			await fireEvent.click(smith);
			await answer('person-1', 'followUps', {
				state: 'ready',
				value: { followUps: [openFollowUp], total: 1 }
			} as RosterPeekRead);
			await fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Complete Turn in TA-50 shortage list' }));

			await fireEvent.keyDown(smith, { key: 'j' });
			await screen.findByRole('complementary', { name: 'Preview of SGT Test Young' });
			await fireEvent.keyDown(document.activeElement!, { key: 'k' });
			await screen.findByRole('complementary', { name: 'Preview of SGT Jane Smith' });
			expect(within(panel()).getByRole('checkbox', { name: 'Complete Turn in TA-50 shortage list' })).toBeTruthy();
			await waitFor(() => expect(reads.filter((read) => read.personnelId === 'person-1')).toHaveLength(9));

			patch.resolve(new Response(JSON.stringify({ status: 'completed' }), { status: 200 }));

			await waitFor(() => expect(reads.filter((read) => read.personnelId === 'person-1')).toHaveLength(10));
			expect(reads.at(-1)).toMatchObject({ personnelId: 'person-1', section: 'followUps' });
			await answer('person-1', 'followUps', { state: 'ready', value: { followUps: [], total: 0 } } as RosterPeekRead);
			expect(within(panel()).getByText('No open follow-ups.')).toBeTruthy();
		});

		it('does nothing after the user leaves the Organization while a follow-up is saving', async () => {
			viewport(1440);
			const { ctx, answer } = peekCtx();
			const patch = Promise.withResolvers<Response>();
			const refresh = vi.spyOn(ctx.signals, 'refresh').mockResolvedValue();
			const invalidate = vi.spyOn(ctx.peek, 'invalidate');
			vi.stubGlobal(
				'fetch',
				vi.fn(() => patch.promise)
			);
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));
			await answer('person-1', 'followUps', {
				state: 'ready',
				value: { followUps: [openFollowUp], total: 1 }
			} as RosterPeekRead);
			await fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Complete Turn in TA-50 shortage list' }));

			endOrganizationLifetime();
			patch.resolve(new Response(JSON.stringify({ status: 'completed' }), { status: 200 }));
			await waitFor(() => {});
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(refresh).not.toHaveBeenCalled();
			expect(invalidate).not.toHaveBeenCalled();
		});

		describe("a row or bulk composer while the preview's composer holds typed text", () => {
			async function typeInPreviewComposer() {
				viewport(1440);
				const { ctx } = peekCtx();
				render(PersonnelPageView, { props: { ctx } });
				await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));
				await fireEvent.click(within(panel()).getByRole('button', { name: /Add a note or follow-up/ }));
				await fireEvent.input(await within(panel()).findByRole('textbox', { name: 'Follow-up title' }), {
					target: { value: 'Call about leave' }
				});
			}

			it('asks before N on a row opens its composer, and opens it after Discard', async () => {
				await typeInPreviewComposer();
				const young = screen.getByRole('row', { name: 'Open SGT Young, Test' });
				young.focus();
				await fireEvent.keyDown(young, { key: 'n' });

				await within(panel()).findByText('Discard what you typed?');
				expect(screen.queryByRole('dialog')).toBeNull();
				await fireEvent.click(within(panel()).getByRole('button', { name: 'Discard' }));

				await screen.findByRole('dialog', { name: 'Add to log for SGT Test Young' });
				expect(within(panel()).queryByRole('textbox', { name: 'Follow-up title' })).toBeNull();
			});

			it('asks before the bulk composer opens, and opens it after Discard', async () => {
				await typeInPreviewComposer();
				await fireEvent.click(screen.getByRole('checkbox', { name: 'Select everyone shown' }));
				await fireEvent.click(bulkBar().getByRole('button', { name: 'Follow-up for each' }));

				await within(panel()).findByText('Discard what you typed?');
				expect(screen.queryByRole('dialog')).toBeNull();
				await fireEvent.click(within(panel()).getByRole('button', { name: 'Discard' }));

				await screen.findByRole('dialog', { name: 'Add to log for 2 people' });
				expect(within(panel()).queryByRole('textbox', { name: 'Follow-up title' })).toBeNull();
			});
		});

		it('announces nothing for a note saved after the user leaves the Organization', async () => {
			viewport(1440);
			const { ctx, reads } = peekCtx();
			const post = Promise.withResolvers<Response>();
			const invalidate = vi.spyOn(ctx.peek, 'invalidate');
			vi.stubGlobal(
				'fetch',
				vi.fn(() => post.promise)
			);
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));
			await fireEvent.click(within(panel()).getByRole('button', { name: /Add a note or follow-up/ }));
			await fireEvent.click(await screen.findByRole('radio', { name: 'Note' }));
			await fireEvent.input(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Strong week.' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
			toastSuccessMock.mockClear();

			endOrganizationLifetime();
			post.resolve(new Response('{}', { status: 200 }));
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(toastSuccessMock).not.toHaveBeenCalled();
			expect(invalidate).not.toHaveBeenCalled();
			expect(reads.every((read) => read.personnelId === 'person-1')).toBe(true);
		});

		it('toggles the preview with Space and selects with x, and a row click with People selected still previews', async () => {
			viewport(1440);
			const { ctx } = peekCtx();
			render(PersonnelPageView, { props: { ctx } });
			const smith = screen.getByRole('row', { name: 'Open SGT Smith, Jane' });
			smith.focus();

			await fireEvent.keyDown(smith, { key: 'x' });
			expect(bulkBar().getByText('1 selected')).toBeTruthy();
			expect(screen.queryByRole('complementary')).toBeNull();

			await fireEvent.keyDown(smith, { key: ' ' });
			expect(panel()).toBeTruthy();
			await fireEvent.keyDown(smith, { key: ' ' });
			await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());

			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Young, Test' }));
			expect(screen.getByRole('complementary', { name: 'Preview of SGT Test Young' })).toBeTruthy();
			expect(bulkBar().getByText('1 selected')).toBeTruthy();
			expect(gotoMock).not.toHaveBeenCalled();
		});

		it("opens the row's editor in place from the preview, and a saved MOS rereads only Needs attention", async () => {
			viewport(1440);
			const { ctx, reads } = peekCtx();
			vi.spyOn(ctx.signals, 'refresh').mockResolvedValue();
			vi.spyOn(personnelStore, 'updateOrThrow').mockImplementation(async (id, data) => {
				personnelStore.updateLocalWhere(
					(item) => item.id === id,
					(item) => ({ ...item, ...data })
				);
				return true;
			});
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));

			await fireEvent.click(within(panel()).getByRole('button', { name: 'Quick edit SGT Jane Smith' }));
			const form = screen.getByRole('form', { name: 'Quick edit SGT Smith, Jane' });
			await fireEvent.input(within(form).getByLabelText('MOS'), { target: { value: '68C' } });
			await fireEvent.submit(form);

			await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
			expect(reads.slice(5).map((read) => `${read.personnelId}:${read.section}`)).toEqual(['person-1:attention']);
			expect(within(panel()).getByText('68C')).toBeTruthy();
		});

		it('rereads Needs attention once when only a loss date is saved, and nothing for a name', async () => {
			viewport(1440);
			const { ctx, reads } = peekCtx();
			const refresh = vi.spyOn(ctx.signals, 'refresh').mockResolvedValue();
			vi.spyOn(personnelStore, 'updateOrThrow').mockImplementation(async (id, data) => {
				personnelStore.updateLocalWhere(
					(item) => item.id === id,
					(item) => ({ ...item, ...data })
				);
				return true;
			});
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));

			await fireEvent.click(within(panel()).getByRole('button', { name: 'Quick edit SGT Jane Smith' }));
			let form = screen.getByRole('form', { name: 'Quick edit SGT Smith, Jane' });
			await fireEvent.click(within(form).getByLabelText('ETS'));
			await fireEvent.click((await screen.findAllByRole('button', { name: /^\w+day, \w+ 15, / }))[0]);
			await fireEvent.submit(form);
			await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
			expect(reads.slice(5).map((read) => `${read.personnelId}:${read.section}`)).toEqual(['person-1:attention']);

			await fireEvent.click(within(panel()).getByRole('button', { name: 'Quick edit SGT Jane Smith' }));
			form = screen.getByRole('form', { name: 'Quick edit SGT Smith, Jane' });
			await fireEvent.input(within(form).getByLabelText('First name'), { target: { value: 'Janet' } });
			await fireEvent.submit(form);
			await waitFor(() => expect(screen.queryByRole('form')).toBeNull());

			expect(reads).toHaveLength(6);
			expect(refresh).not.toHaveBeenCalled();
		});

		it("rereads the shown Person's follow-ups after a follow-up for each, and Calendar and Needs attention after a Group move", async () => {
			viewport(1440);
			const { ctx, reads } = peekCtx();
			Object.assign(ctx, { canManagePersonnelInGroup: () => true });
			vi.spyOn(ctx.signals, 'refresh').mockResolvedValue();
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(Response.json({ writtenIds: ['person-1'], unavailableIds: [] }, { status: 201 }))
				.mockResolvedValueOnce(Response.json({ movedIds: ['person-1'], unavailableIds: [] }));
			vi.stubGlobal('fetch', fetchMock);
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));
			await selectBulkPersonnel(['Select SGT Smith, Jane']);

			await fireEvent.click(bulkBar().getByRole('button', { name: 'Follow-up for each' }));
			const dialog = await screen.findByRole('dialog', { name: 'Add to log for 1 person' });
			await fireEvent.input(within(dialog).getByPlaceholderText('What needs to happen?'), {
				target: { value: 'Turn in CIF hand receipt' }
			});
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Add follow-up' }));
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
			expect(reads.slice(5).map((read) => `${read.personnelId}:${read.section}`)).toEqual(['person-1:followUps']);

			await fireEvent.keyDown(bulkBar().getByRole('button', { name: 'Move to Group' }), { key: 'Enter' });
			await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Bravo' }));
			await waitFor(() => expect(toastSuccessMock.mock.lastCall?.[0]).toBe('Moved 1 person to Bravo'));
			expect(reads.slice(6).map((read) => `${read.personnelId}:${read.section}`)).toEqual([
				'person-1:next7',
				'person-1:attention'
			]);
		});

		it('closes when the shown Person is archived', async () => {
			viewport(1440);
			const { ctx } = peekCtx();
			Object.assign(ctx, {
				canArchivePersonnelRecord: () => true,
				personnelArchiveAffordance: () => allowedAffordance()
			});
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(batchResponse({ archivedIds: ['person-1'], approvalRequestedIds: [], errors: [] }))
			);
			render(PersonnelPageView, { props: { ctx } });
			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));
			await selectBulkPersonnel(['Select SGT Smith, Jane']);

			await submitBulkSelection();

			await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
			expect(screen.queryByRole('row', { name: 'Open SGT Smith, Jane' })).toBeNull();
		});

		it('opens the record from a row click on a narrow screen', async () => {
			viewport(1024);
			const { ctx, reads } = peekCtx();
			render(PersonnelPageView, { props: { ctx } });

			await fireEvent.click(screen.getByRole('row', { name: 'Open SGT Smith, Jane' }));

			expect(gotoMock).toHaveBeenCalledExactlyOnceWith('/org/org-1/personnel/smith-jane');
			expect(screen.queryByRole('complementary')).toBeNull();
			expect(reads).toEqual([]);
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
			return makeCtx({ canViewAvailability });
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

		it('moves the lane to the new day when a composer opens on a page left open past midnight', async () => {
			let browserDay = '2026-10-23';
			const signals = new RosterSignals({ readPeople: vi.fn(), browserDay: () => browserDay });
			personnelStore.load([personnel[0]], 'org-1');
			const ctx = makeCtx({ signals, canManagePersonnelRecord: () => true });
			signals.observe('org-1', '2026-10-23', Promise.withResolvers<never>().promise);
			render(PersonnelPageView, { props: { ctx } });
			expect(invalidateMock).not.toHaveBeenCalled();

			browserDay = '2026-10-24';
			expect(invalidateMock).not.toHaveBeenCalled();
			await fireEvent.click(screen.getAllByRole('button', { name: 'Note for SGT Smith, Jane' })[0]);

			expect(await screen.findByRole('dialog', { name: 'Add to log for SGT Jane Smith' })).toBeTruthy();
			expect(invalidateMock).toHaveBeenCalledExactlyOnceWith('app:personnel-signals');
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

	describe('attention filters', () => {
		const LEAVE = { id: 'leave', name: 'Leave', color: '#2563eb', textColor: '#ffffff', sortOrder: 0 };
		const ACCESS = {
			availability: true,
			training: true,
			criticalTasks: false,
			evaluations: false,
			followUps: false,
			counseling: false
		};
		const smith = {
			personnelId: 'person-1',
			today: { kind: 'known', value: { kind: 'away', statusTypeId: 'leave' } },
			attention: {
				kind: 'known',
				value: {
					kind: 'attention',
					first: { kind: 'training', status: 'expiring', title: 'SHARP', days: 12 },
					otherCount: 1,
					worst: 'red'
				}
			},
			matches: {
				expired: { item: { kind: 'training', status: 'expired', title: 'CPR/BLS', days: -3 }, otherCount: 0 }
			},
			openFollowUps: { kind: 'withheld' }
		};
		const young = {
			personnelId: 'person-2',
			today: { kind: 'known', value: { kind: 'present' } },
			attention: { kind: 'known', value: { kind: 'clear' } },
			matches: {},
			openFollowUps: { kind: 'withheld' }
		};

		function filterCtx(overrides: Partial<PersonnelPageContext> = {}) {
			personnelStore.load([personnel[0], { ...makePerson(2), lastName: 'Young' }], 'org-1');
			return makeCtx({ canViewAvailability: true }, overrides);
		}

		function settle(ctx: PersonnelPageContext, access = ACCESS) {
			ctx.signals.observe(
				'org-1',
				'2026-10-23',
				Promise.resolve({ asOf: '2026-10-23', access, statusTypes: [LEAVE], people: [smith, young] }) as never
			);
		}

		function showing(value: string) {
			pageMock.url = new URL(`http://localhost/org/org-1/personnel?show=${value}`);
		}

		const rowNames = () =>
			screen
				.getAllByRole('row')
				.map((row) => row.getAttribute('aria-label'))
				.filter((name) => name?.startsWith('SGT'));

		it('counts each chip over the whole roster and mutes a chip with nothing behind it', async () => {
			const ctx = filterCtx();
			settle(ctx);
			render(PersonnelPageView, { props: { ctx } });

			await screen.findByRole('button', { name: /Expired or missing/ });
			const chips = within(screen.getByRole('group', { name: 'Show only' }));
			expect(chips.getAllByRole('button').map((chip) => chip.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
				'Expired or missing 1',
				'Expiring ≤ 30d 0',
				'Not present 1',
				'ETS/PCS ≤ 90d 0'
			]);
			expect((chips.getByRole('button', { name: /Expiring/ }) as HTMLButtonElement).disabled).toBe(true);
			expect((chips.getByRole('button', { name: /Expired/ }) as HTMLButtonElement).disabled).toBe(false);

			await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'Young' } });
			expect(chips.getByRole('button', { name: /Expired/ }).textContent).toContain('1');
		});

		it('holds the chip row in place until the lane settles and hides it when the lane fails', async () => {
			const held = filterCtx();
			const lane = Promise.withResolvers<never>();
			held.signals.observe('org-1', '2026-10-23', lane.promise);
			const { unmount } = render(PersonnelPageView, { props: { ctx: held } });
			const row = screen.getByRole('group', { name: 'Show only' });
			expect(row.getAttribute('aria-busy')).toBe('true');
			expect(screen.queryByRole('button', { name: /Expired/ })).toBeNull();

			lane.resolve({
				asOf: '2026-10-23',
				access: ACCESS,
				statusTypes: [LEAVE],
				people: [smith, young]
			} as never);
			await screen.findByRole('button', { name: /Expired or missing/ });
			expect(screen.getByRole('group', { name: 'Show only' }).getAttribute('aria-busy')).toBe('false');
			unmount();

			const failed = filterCtx();
			failed.signals.observe('org-1', '2026-10-23', Promise.reject(new Error('statement timeout')));
			render(PersonnelPageView, { props: { ctx: failed } });
			await screen.findByRole('button', { name: 'Reload' });
			expect(screen.queryByRole('group', { name: 'Show only' })).toBeNull();
		});

		it('reserves no chip row for a viewer who can never see a chip, before or after the lane settles', async () => {
			const noChips = { ...ACCESS, availability: false, training: false };
			const held = filterCtx({ expectedChipCount: 0, lossesEnabled: false });
			held.signals.observe('org-1', '2026-10-23', Promise.withResolvers<never>().promise);
			const { unmount } = render(PersonnelPageView, { props: { ctx: held } });
			expect(screen.getByRole('row', { name: 'SGT Smith, Jane' })).toBeTruthy();
			expect(screen.queryByRole('group', { name: 'Show only' })).toBeNull();
			unmount();

			const settled = filterCtx({ expectedChipCount: 0, lossesEnabled: false });
			settle(settled, noChips);
			render(PersonnelPageView, { props: { ctx: settled } });
			await screen.findByRole('row', { name: 'SGT Smith, Jane' });
			expect(screen.queryByRole('group', { name: 'Show only' })).toBeNull();
		});

		it('writes the chosen chip to the URL without adding history or moving focus', async () => {
			const ctx = filterCtx();
			settle(ctx);
			render(PersonnelPageView, { props: { ctx } });

			await fireEvent.click(await screen.findByRole('button', { name: /Expired or missing/ }));
			expect(gotoMock).toHaveBeenCalledExactlyOnceWith('/org/org-1/personnel?show=expired', {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		});

		it('leaves chips and headcount toggles as they were when a dirty quick edit holds the navigation', async () => {
			groupCatalogHydration.load(
				[{ id: 'group-1', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const }],
				'org-1'
			);
			gotoMock.mockImplementation((href: string) => {
				const guard = beforeNavigateMock.mock.calls.at(-1)![0] as (navigation: unknown) => void;
				guard({
					type: 'goto',
					willUnload: false,
					to: { url: new URL(href, 'http://localhost') },
					cancel: () => undefined
				});
			});
			const ctx = filterCtx({
				canManagePersonnelRecord: () => true,
				canReadPersonnelDetails: true,
				canOpenPersonnelDetail: () => true,
				personnelRecordAffordance: () => allowedAffordance()
			});
			settle(ctx);
			render(PersonnelPageView, { props: { ctx } });

			await fireEvent.click(
				screen
					.getAllByRole('button', { name: 'Quick edit SGT Smith, Jane' })
					.find((button) => button.getAttribute('title') === 'Quick edit (E)')!
			);
			await fireEvent.input(screen.getByLabelText('Duty role'), { target: { value: 'Senior Medic' } });
			const names = rowNames();

			await fireEvent.click(await screen.findByRole('button', { name: /Expired or missing/ }));
			await fireEvent.click(
				within(await screen.findByRole('alertdialog', { name: 'Save changes first?' })).getByRole('button', {
					name: 'Cancel'
				})
			);
			await fireEvent.click(
				within(screen.getByRole('list', { name: "Today's headcount" })).getByRole('button', { name: /Leave/ })
			);
			await fireEvent.click(
				within(await screen.findByRole('alertdialog', { name: 'Save changes first?' })).getByRole('button', {
					name: 'Cancel'
				})
			);

			expect(screen.getByRole('button', { name: /Expired or missing/ }).getAttribute('aria-pressed')).toBe('false');
			expect(
				within(screen.getByRole('list', { name: "Today's headcount" }))
					.getByRole('button', { name: /Leave/ })
					.getAttribute('aria-pressed')
			).toBe('false');
			expect(rowNames()).toEqual(names);
			groupCatalogHydration.load([], 'org-test-reset');
		});

		it('narrows the roster to the people a chip from the link matches and shows the matched item', async () => {
			showing('expired');
			const ctx = filterCtx();
			settle(ctx);
			render(PersonnelPageView, { props: { ctx } });

			await waitFor(() => expect(rowNames()).toEqual(['SGT Smith, Jane']));
			const smithRow = within(screen.getByRole('row', { name: 'SGT Smith, Jane' }));
			expect(smithRow.getAllByTitle('CPR/BLS expired').length).toBeGreaterThan(0);
			expect(smithRow.queryByTitle(/SHARP/)).toBeNull();
			expect(screen.getByText('1 of 2 match')).toBeTruthy();
			expect(screen.getByRole('button', { name: /Expired or missing/ }).getAttribute('aria-pressed')).toBe('true');
		});

		it('clears the filter from the active chip and narrows again with search', async () => {
			showing('not-present');
			const ctx = filterCtx();
			settle(ctx);
			render(PersonnelPageView, { props: { ctx } });
			await waitFor(() => expect(rowNames()).toEqual(['SGT Smith, Jane']));

			await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'Young' } });
			expect(await screen.findByText('No personnel match this filter.')).toBeTruthy();
			expect(screen.getByText('0 of 2 match')).toBeTruthy();

			await fireEvent.click(screen.getByRole('button', { name: /Not present/ }));
			expect(gotoMock).toHaveBeenCalledExactlyOnceWith('/org/org-1/personnel', {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		});

		it('filters by the headcount entries, a status type or Present', async () => {
			const ctx = filterCtx();
			settle(ctx);
			render(PersonnelPageView, { props: { ctx } });
			const headcount = within(screen.getByRole('list', { name: "Today's headcount" }));

			await fireEvent.click(await headcount.findByRole('button', { name: /Leave/ }));
			expect(gotoMock).toHaveBeenLastCalledWith('/org/org-1/personnel?show=status%3Aleave', expect.anything());
			await fireEvent.click(headcount.getByRole('button', { name: /present/ }));
			expect(gotoMock).toHaveBeenLastCalledWith('/org/org-1/personnel?show=present', expect.anything());
		});

		it('keeps a shared status filter clearable when nobody has that status today', async () => {
			showing('status%3Atraining');
			const ctx = filterCtx();
			ctx.signals.observe(
				'org-1',
				'2026-10-23',
				Promise.resolve({
					asOf: '2026-10-23',
					access: ACCESS,
					statusTypes: [LEAVE, { ...LEAVE, id: 'training', name: 'Training' }],
					people: [smith, young]
				}) as never
			);
			render(PersonnelPageView, { props: { ctx } });

			const active = await within(screen.getByRole('list', { name: "Today's headcount" })).findByRole('button', {
				name: /Training/
			});
			expect(active.getAttribute('aria-pressed')).toBe('true');
			expect(active.textContent?.replace(/\s+/g, ' ').trim()).toBe('0 Training');
			expect(screen.getByText('No personnel match this filter.')).toBeTruthy();

			await fireEvent.click(active);
			expect(gotoMock).toHaveBeenCalledExactlyOnceWith('/org/org-1/personnel', {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		});

		it('shows who is present for a shared Present link', async () => {
			showing('present');
			const ctx = filterCtx();
			settle(ctx);
			render(PersonnelPageView, { props: { ctx } });
			await waitFor(() => expect(rowNames()).toEqual(['SGT Young, Test']));
			expect(screen.getByText('1 of 2 match')).toBeTruthy();
		});

		it('drops a value nobody recognises from the address and keeps the roster whole', async () => {
			showing('everyone');
			const ctx = filterCtx();
			settle(ctx);
			render(PersonnelPageView, { props: { ctx } });

			await waitFor(() =>
				expect(gotoMock).toHaveBeenCalledExactlyOnceWith('/org/org-1/personnel', {
					replaceState: true,
					keepFocus: true,
					noScroll: true
				})
			);
			expect(rowNames()).toEqual(['SGT Smith, Jane', 'SGT Young, Test']);
		});

		it('ignores a filter whose source the viewer cannot read and offers to clear it', async () => {
			showing('follow-ups');
			const ctx = filterCtx();
			settle(ctx);
			render(PersonnelPageView, { props: { ctx } });

			await screen.findByText('Filter unavailable.');
			expect(rowNames()).toEqual(['SGT Smith, Jane', 'SGT Young, Test']);
			await fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
			expect(gotoMock).toHaveBeenLastCalledWith('/org/org-1/personnel', expect.anything());
		});

		it('shows the whole roster with a note when the lane fails under a filtered link', async () => {
			showing('expired');
			const ctx = filterCtx();
			ctx.signals.observe('org-1', '2026-10-23', Promise.reject(new Error('statement timeout')));
			render(PersonnelPageView, { props: { ctx } });

			await screen.findByText(/Filter unavailable\./);
			expect(rowNames()).toEqual(['SGT Smith, Jane', 'SGT Young, Test']);
			expect(gotoMock).not.toHaveBeenCalled();
		});

		it('keeps a selection through a filter change and says how many it hides and why', async () => {
			const ctx = filterCtx({
				canManagePersonnelRecord: () => true,
				canExportPersonnelRecord: () => true,
				canArchivePersonnelRecord: () => true,
				canManagePersonnelInGroup: () => true,
				personnelArchiveAffordance: () => allowedAffordance()
			});
			settle(ctx);
			render(PersonnelPageView, { props: { ctx } });
			await screen.findByRole('button', { name: /Expired or missing/ });
			await selectBulkPersonnel(['Select SGT Smith, Jane', 'Select SGT Young, Test']);
			const barText = () =>
				screen.getByRole('toolbar', { name: 'Selected people' }).textContent?.replace(/\s+/g, ' ').trim();
			expect(barText()).not.toContain('hidden');

			showing('expired');
			await vi.waitFor(() => expect(rowNames()).toEqual(['SGT Smith, Jane']));
			expect(barText()).toContain('2 selected · 1 hidden by filter');
			await fireEvent.click(archiveButton());
			const dialog = await screen.findByRole('alertdialog');
			expect(dialog.textContent).toContain('Archive 2 personnel?');
			expect(dialog.textContent).toContain('This includes 1 person your filter hides.');
			await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

			await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, MOS, role, or group' }), {
				target: { value: 'Smith' }
			});
			expect(barText()).toContain('2 selected · 1 hidden by search and filter');

			pageMock.url = new URL('http://localhost/org/org-1/personnel');
			await vi.waitFor(() => expect(barText()).toContain('2 selected · 1 hidden by search'));
			await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, MOS, role, or group' }), {
				target: { value: '' }
			});
			expect(barText()).toContain('2 selected Follow-up');
			expect(barText()).not.toContain('hidden');
		});

		it('counts and steps the peek over the rows a filter shows, and closes it when a filter hides the Person', async () => {
			vi.stubGlobal('matchMedia', (query: string) => ({
				matches: true,
				media: query,
				addEventListener: () => {},
				removeEventListener: () => {}
			}));
			personnelStore.load(
				[personnel[0], { ...makePerson(2), lastName: 'Young' }, { ...makePerson(3), lastName: 'Adams' }],
				'org-1'
			);
			const ctx = makeCtx({
				canViewAvailability: true,
				canReadPersonnelDetails: true,
				canOpenPersonnelDetail: () => true,
				personnelRecordAffordance: () => allowedAffordance()
			});
			const adams = { ...smith, personnelId: 'person-3' };
			ctx.signals.observe(
				'org-1',
				'2026-10-23',
				Promise.resolve({
					asOf: '2026-10-23',
					access: ACCESS,
					statusTypes: [LEAVE],
					people: [smith, young, adams]
				}) as never
			);
			showing('expired');
			render(PersonnelPageView, { props: { ctx } });
			const smithRow = await screen.findByRole('row', { name: 'Open SGT Smith, Jane' });
			const preview = (name: string) => screen.findByRole('complementary', { name: `Preview of ${name}` });

			await fireEvent.click(smithRow);
			expect(within(await preview('SGT Jane Smith')).getByText('2 of 2 · J/K')).toBeTruthy();
			expect(screen.queryByRole('list', { name: "Today's headcount" })).toBeNull();
			expect(screen.getByRole('button', { name: /Expired or missing/ })).toBeTruthy();
			await fireEvent.keyDown(smithRow, { key: 'k' });
			expect(within(await preview('SGT Test Adams')).getByText('1 of 2 · J/K')).toBeTruthy();

			pageMock.url = new URL('http://localhost/org/org-1/personnel');
			await vi.waitFor(() => expect(screen.getByText('1 of 3 · J/K')).toBeTruthy());

			showing('present');
			await vi.waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
			expect(screen.getByRole('row', { name: 'Open SGT Young, Test' })).toBeTruthy();
			expect(screen.queryByRole('row', { name: 'Open SGT Adams, Test' })).toBeNull();
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
		const roster = Array.from({ length: 101 }, (_, index) => makePerson(index + 1));
		personnelStore.load(roster, 'org-1');
		const fetchMock = vi.fn().mockResolvedValue(
			batchResponse({
				archivedIds: roster.slice(0, 100).map((person) => person.id),
				approvalRequestedIds: [],
				errors: []
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		render(PersonnelPageView, { props: { ctx: archiveCtx() } });

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select everyone shown' }));
		expect(bulkBar().getByText('100 selected')).toBeTruthy();
		await submitBulkSelection();

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const request = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { ids: string[] };
		expect(request.ids).toHaveLength(100);
		expect(request.ids).toContain('person-1');
		expect(request.ids).not.toContain('person-101');
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
