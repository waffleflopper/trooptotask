// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap, type ScopeSet } from '$lib/access/memberAccessShape';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingPageView from './TrainingPageView.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { personnelRosterHydration } from '$features/personnel';
import { pinnedGroupsHydration } from '$features/personnel';
import { groupCatalogHydration } from '$features/personnel';
import type { Personnel } from '$features/personnel/contracts';
import type { Group } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/training.types';
import { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
import TrainingModals from './TrainingModals.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import ExcelJS from 'exceljs';
import * as workbookHelpers from '$lib/utils/workbook';
import { tick } from 'svelte';
import { fromStore, writable } from 'svelte/store';
import { goto } from '$app/navigation';
import {
	openToolbarMore,
	openToolbarSubmenu,
	stubToolbarWidths,
	toolbarDescription,
	type ToolbarWidths
} from '$lib/test-support/toolbarWidths';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: vi.fn(),
	invalidateAll: vi.fn()
}));

const trainingType: TrainingType = {
	id: 'type-1',
	name: 'CPR',
	description: null,
	expirationMonths: 12,
	warningDaysYellow: 60,
	warningDaysOrange: 30,
	appliesToRoles: [],
	appliesToMos: [],
	appliesToRanks: [],
	excludedRoles: [],
	excludedMos: [],
	excludedRanks: [],
	color: '#22c55e',
	sortOrder: 0,
	expirationDateOnly: false,
	canBeExempted: false,
	exemptPersonnelIds: [],
	isOptional: false
};

const groups: Group[] = [
	{ id: 'group-1', name: 'Alpha', sortOrder: 0 },
	{ id: 'group-2', name: 'Bravo', sortOrder: 1 }
];

const personnel: Personnel[] = [
	{
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-1',
		groupName: 'Alpha'
	},
	{
		id: 'person-2',
		rank: 'SPC',
		lastName: 'Adams',
		firstName: 'John',
		mos: '11B',
		clinicRole: 'Line',
		groupId: 'group-2',
		groupName: 'Bravo'
	}
] as Personnel[];

interface TrainingPageViewTestCtx {
	selectedViewId: string | null;
	setSelectedViewId: ReturnType<typeof vi.fn>;
	canManageConfig: boolean;
	canViewTraining: boolean;
	canRecordTraining: boolean;
	groups: Group[];
	selectedGroupId: string;
	setSelectedGroupId: ReturnType<typeof vi.fn>;
	groupFilterOptions: Array<{ value: string; label: string }>;
	viewMode: 'alphabetical' | 'by-group';
	setViewMode: ReturnType<typeof vi.fn>;
	filteredPersonnel: Personnel[];
	orgId: string;
	handleCellClick: ReturnType<typeof vi.fn>;
	handlePersonClick: ReturnType<typeof vi.fn>;
}

function makeCtx(viewMode: 'alphabetical' | 'by-group', overrides: Partial<TrainingPageViewTestCtx> = {}) {
	return {
		selectedViewId: null,
		setSelectedViewId: vi.fn(),
		canManageConfig: true,
		canViewTraining: true,
		canRecordTraining: true,
		groups,
		selectedGroupId: '',
		setSelectedGroupId: vi.fn(),
		groupFilterOptions: [
			{ value: '', label: 'Group: All' },
			{ value: 'group-1', label: 'Alpha' },
			{ value: 'group-2', label: 'Bravo' }
		],
		viewMode,
		setViewMode: vi.fn(),
		filteredPersonnel: personnel,
		orgId: 'org-1',
		handleCellClick: vi.fn(),
		handlePersonClick: vi.fn(),
		...overrides
	} satisfies TrainingPageViewTestCtx;
}

describe('TrainingPageView', () => {
	beforeEach(() => {
		personnelRosterHydration.load(personnel, 'org-1');
		groupCatalogHydration.load(groups, 'org-1');
		trainingTypesStore.load([trainingType], 'org-1');
		trainingViewsStore.load([], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
		pinnedGroupsHydration.load(['Alpha'], 'org-1');
	});

	afterEach(() => {
		cleanup();
		vi.mocked(goto).mockClear();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
		personnelRosterHydration.load([], 'org-test-reset');
		groupCatalogHydration.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
		trainingViewsStore.load([], 'org-test-reset');
		personnelTrainingsStore.load([], 'org-test-reset');
		pinnedGroupsHydration.load([], 'org-test-reset');
	});

	it('announces the loading skeleton as a busy status region and describes why export is unavailable', () => {
		personnelRosterHydration.load(personnel, 'org-stale');
		groupCatalogHydration.load(groups, 'org-stale');
		trainingTypesStore.load([trainingType], 'org-stale');
		personnelTrainingsStore.load([], 'org-stale');

		render(TrainingPageView, {
			props: {
				ctx: makeCtx('alphabetical', { orgId: 'org-2' }) as unknown as TrainingPageContext,
				modals: new ModalRegistry()
			}
		});

		const status = screen.getByRole('status', { name: 'Loading training matrix' });
		expect(status.getAttribute('aria-live')).toBe('polite');
		expect(status.hasAttribute('aria-busy')).toBe(false);
		const exportButton = screen.getByRole('button', { name: 'Export Excel' }) as HTMLButtonElement;
		expect(exportButton.disabled).toBe(true);
		expect(toolbarDescription(exportButton)).toBe('Export unavailable while loading.');
	});

	it.each([
		{ label: 'an empty roster', overrides: { filteredPersonnel: [] }, reason: 'No personnel to export.' },
		{ label: 'no training types', overrides: {}, reason: 'No training types to export.' }
	])('states why Export Excel is disabled for $label', ({ overrides, reason }) => {
		if (reason === 'No training types to export.') trainingTypesStore.load([], 'org-1');

		render(TrainingPageView, {
			props: {
				ctx: makeCtx('alphabetical', overrides) as unknown as TrainingPageContext,
				modals: new ModalRegistry()
			}
		});

		const exportButton = screen.getByRole('button', { name: 'Export Excel' }) as HTMLButtonElement;
		expect(exportButton.disabled).toBe(true);
		expect(toolbarDescription(exportButton)).toBe(reason);
	});

	it('retains a failed completion draft and updates the matrix after a successful retry', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
		const saved = {
			id: 'saved-training',
			personnelId: 'person-1',
			trainingTypeId: 'type-1',
			completionDate: '2026-06-15',
			expirationDate: '2027-06-15',
			notes: 'Range qualification',
			certificateUrl: null
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Recording denied' }), { status: 403 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(saved), { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		const modals = new ModalRegistry();
		const ctx = new TrainingPageContext(
			{ orgId: 'org-1', orgName: 'Test Org' },
			modals,
			{
				orgId: 'org-1',
				orgUrlSegment: 'org-1',
				...createClientAccess({ membershipRole: 'owner', capabilityMap: createCapabilityMap('configure') })
			},
			vi.fn().mockResolvedValue(true),
			vi.fn().mockResolvedValue(undefined)
		);
		render(TrainingPageView, { props: { ctx, modals } });
		render(TrainingModals, { props: { ctx, modals } });
		await fireEvent.click(screen.getByLabelText('Smith CPR: Not Done'));
		const notes = await screen.findByRole('textbox', { name: 'Notes (optional)' });
		await fireEvent.input(notes, { target: { value: 'Range qualification' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false));
		expect((notes as HTMLTextAreaElement).value).toBe('Range qualification');
		expect(personnelTrainingsStore.items).toEqual([]);
		expect(screen.getByLabelText('Smith CPR: Not Done')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(screen.getByLabelText('Smith CPR: Current')).toBeTruthy();
		expect(personnelTrainingsStore.items).toEqual([saved]);
		expect(fetchMock).toHaveBeenLastCalledWith(
			'/org/org-1/api/personnel-trainings',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					personnelId: 'person-1',
					trainingTypeId: 'type-1',
					completionDate: '2026-06-15',
					expirationDate: '2027-06-15',
					notes: 'Range qualification',
					certificateUrl: null
				})
			})
		);
	});

	it("groups the matrix in the Organization's Group order with Unassigned last when nothing is pinned", () => {
		groupCatalogHydration.load(
			[
				{ id: 'group-1', name: 'Alpha', sortOrder: 1 },
				{ id: 'group-2', name: 'Bravo', sortOrder: 0 }
			],
			'org-1'
		);
		pinnedGroupsHydration.load([], 'org-1');
		const unassigned = { ...personnel[0], id: 'person-3', groupId: null, groupName: '' } as Personnel;

		render(TrainingPageView, {
			props: {
				ctx: makeCtx('by-group', { filteredPersonnel: [...personnel, unassigned] }) as unknown as TrainingPageContext,
				modals: new ModalRegistry()
			}
		});

		const headers = [...screen.getByTestId('training-matrix').querySelectorAll('[data-row-group-id]')].map((row) =>
			row.getAttribute('data-row-group-id')
		);
		expect(headers).toEqual(['Bravo', 'Alpha', 'Unassigned']);
	});

	it('links manage views to the training views workspace', () => {
		render(TrainingPageView, {
			props: {
				ctx: makeCtx('by-group') as unknown as TrainingPageContext,
				modals: new ModalRegistry()
			}
		});

		const manageViews = screen.getByRole('link', { name: /Manage Views/i });
		expect(manageViews.getAttribute('href')).toBe('/org/org-1/training/views');
	});

	it.each([
		['operate', '/org/org-1/training/import'],
		['view', null]
	] as const)('links Import to the import page only for someone who can record completions (%s)', (training, href) => {
		const org = {
			orgId: 'org-1',
			orgUrlSegment: 'org-1',
			...createClientAccess({
				membershipRole: 'member',
				capabilityMap: { ...createCapabilityMap('none'), training },
				scopeSet: { kind: 'groups', groupIds: ['group-1'] }
			})
		};
		const ctx = new TrainingPageContext(
			{ orgId: 'org-1', orgName: 'Test Org' },
			new ModalRegistry(),
			org,
			vi.fn().mockResolvedValue(true),
			vi.fn().mockResolvedValue(undefined)
		);
		render(TrainingPageView, { props: { ctx, modals: new ModalRegistry() } });

		expect(screen.queryByRole('link', { name: 'Import' })?.getAttribute('href') ?? null).toBe(href);
		expect(screen.queryByRole('link', { name: 'Manage Types' })).toBeNull();
	});

	function exportContext(
		capability: 'view' | 'none' = 'view',
		orgId = 'org-1',
		getScope: () => ScopeSet = () => ({ kind: 'organization' })
	): TrainingPageContext {
		const access = createClientAccess(() => ({
			membershipRole: 'member',
			capabilityMap: { ...createCapabilityMap('none'), training: capability },
			scopeSet: getScope()
		}));
		return new TrainingPageContext(
			{ orgId, orgName: 'Test Org' },
			new ModalRegistry(),
			{
				...access,
				orgId,
				orgUrlSegment: orgId,
				get scopeSet() {
					return access.scopeSet;
				}
			},
			vi.fn().mockResolvedValue(true),
			vi.fn()
		);
	}

	function captureDownload() {
		const blobs: Blob[] = [];
		const filenames: string[] = [];
		const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
			blobs.push(blob as Blob);
			return 'blob:training-export';
		});
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
			filenames.push(this.download);
		});
		return { blobs, filenames, createUrl };
	}

	function holdWorkbook() {
		const generated = Promise.withResolvers<Blob>();
		const release = Promise.withResolvers<void>();
		const original = workbookHelpers.workbookBlob;
		vi.spyOn(workbookHelpers, 'workbookBlob').mockImplementation(async (workbook) => {
			const blob = await original(workbook);
			generated.resolve(blob);
			await release.promise;
			return blob;
		});
		return { generated: generated.promise, release: release.resolve };
	}

	it('downloads the selected group snapshot with hidden saved-view columns and prevents duplicate exports while busy', async () => {
		trainingTypesStore.load(
			[
				trainingType,
				{
					...trainingType,
					id: 'optional',
					name: 'Orientation',
					expirationMonths: null,
					isOptional: true,
					sortOrder: -1
				}
			],
			'org-1'
		);
		trainingViewsStore.load(
			[
				{
					id: 'focus',
					name: 'Focus',
					columnIds: ['type-1'],
					createdBy: 'user',
					createdAt: '2026-01-01',
					updatedAt: '2026-01-01'
				}
			],
			'org-1'
		);
		personnelTrainingsStore.load(
			[
				{
					id: 'completion',
					personnelId: 'person-1',
					trainingTypeId: 'type-1',
					completionDate: '2025-02-03',
					expirationDate: '2026-02-03',
					notes: null,
					certificateUrl: null
				}
			],
			'org-1'
		);
		const ctx = exportContext();
		ctx.setSelectedGroupId('group-1');
		ctx.setSelectedViewId('focus');
		const { blobs, filenames } = captureDownload();
		const pending = holdWorkbook();
		render(TrainingPageView, { props: { ctx, modals: new ModalRegistry() } });
		const button = screen.getByRole('button', { name: 'Export Excel' });
		button.focus();
		await Promise.all([fireEvent.click(button), fireEvent.click(button)]);
		await pending.generated;
		const exporting = screen.getByRole('button', { name: 'Exporting...' }) as HTMLButtonElement;
		expect([exporting === document.activeElement, exporting.disabled, exporting.getAttribute('aria-disabled')]).toEqual(
			[true, false, 'true']
		);
		await fireEvent.click(exporting);
		personnelTrainingsStore.items[0].completionDate = '2040-01-01';
		ctx.setSelectedGroupId('group-2');
		pending.release();
		await waitFor(() => expect(filenames).toHaveLength(1));
		const parsed = new ExcelJS.Workbook();
		await parsed.xlsx.load(
			Buffer.from(await blobs[0].arrayBuffer()) as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]
		);
		expect(parsed.getWorksheet('Training Matrix')!.getSheetValues().slice(2)).toEqual([
			[undefined, 'Name', 'Rank', 'Group', 'Orientation (completion only)', 'CPR'],
			[undefined, 'Smith, Jane', 'SGT', 'Alpha', 'not required', '2025-02-03']
		]);
		expect(filenames[0]).toMatch(/^training-matrix-\d{4}-\d{2}-\d{2}\.xlsx$/);
		expect(parsed.getWorksheet('Training Matrix')!.getCell('A1').value).toContain(
			`Exported ${filenames[0].slice('training-matrix-'.length, -'.xlsx'.length)}.`
		);
		expect((screen.getByRole('button', { name: 'Export Excel' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('suppresses an old-scope workbook when same-Organization access narrows while Training view remains allowed', async () => {
		const scope = writable<ScopeSet>({ kind: 'organization' });
		const liveScope = fromStore(scope);
		const ctx = exportContext('view', 'org-1', () => liveScope.current);
		const { filenames } = captureDownload();
		const pending = holdWorkbook();
		render(TrainingPageView, { props: { ctx, modals: new ModalRegistry() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
		const blob = await pending.generated;
		const parsed = new ExcelJS.Workbook();
		await parsed.xlsx.load(
			Buffer.from(await blob.arrayBuffer()) as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]
		);
		expect(parsed.getWorksheet('Training Matrix')!.getSheetValues().slice(2)).toEqual([
			[undefined, 'Name', 'Rank', 'Group', 'CPR'],
			[undefined, 'Adams, John', 'SPC', 'Bravo', 'missing'],
			[undefined, 'Smith, Jane', 'SGT', 'Alpha', 'missing']
		]);
		scope.set({ kind: 'groups', groupIds: ['group-1'] });
		await tick();
		expect(ctx.personnel.map((person) => person.id)).toEqual(['person-1']);
		expect(ctx.canViewTraining).toBe(true);
		pending.release();
		await waitFor(() =>
			expect((screen.getByRole('button', { name: 'Export Excel' }) as HTMLButtonElement).disabled).toBe(false)
		);
		expect(filenames).toEqual([]);
	});

	it('shows a download failure and retries successfully through the visible control', async () => {
		const { filenames, createUrl } = captureDownload();
		createUrl.mockImplementationOnce(() => {
			throw new Error('internal module details');
		});
		render(TrainingPageView, { props: { ctx: exportContext(), modals: new ModalRegistry() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		expect(filenames).toEqual([]);
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		await waitFor(() => expect(filenames).toHaveLength(1));
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it.each(['loading', 'stale organization', 'empty roster', 'empty catalog'] as const)(
		'disables export for %s without attempting a download',
		async (condition) => {
			if (condition === 'loading') personnelTrainingsStore.startLoading();
			if (condition === 'stale organization') trainingTypesStore.load([trainingType], 'another-org');
			if (condition === 'empty roster') personnelRosterHydration.load([], 'org-1');
			if (condition === 'empty catalog') trainingTypesStore.load([], 'org-1');
			const { filenames } = captureDownload();
			render(TrainingPageView, { props: { ctx: exportContext(), modals: new ModalRegistry() } });
			const button = screen.getByRole('button', { name: 'Export Excel' }) as HTMLButtonElement;
			expect(button.disabled).toBe(true);
			await fireEvent.click(button);
			expect(filenames).toEqual([]);
		}
	);

	it.each(['organization changes', 'access disappears', 'unmounts'] as const)(
		'cancels a delayed download when the workspace %s',
		async (condition) => {
			const { filenames } = captureDownload();
			const pending = holdWorkbook();
			const modals = new ModalRegistry();
			const view = render(TrainingPageView, { props: { ctx: exportContext(), modals } });
			await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
			await pending.generated;
			if (condition === 'organization changes') await view.rerender({ ctx: exportContext('view', 'org-2'), modals });
			if (condition === 'access disappears') await view.rerender({ ctx: exportContext('none'), modals });
			if (condition === 'unmounts') view.unmount();
			pending.release();
			await tick();
			expect(filenames).toEqual([]);
		}
	);

	describe('toolbar folded into More', () => {
		let widths: ToolbarWidths;

		beforeEach(() => {
			widths = stubToolbarWidths();
		});

		afterEach(() => vi.unstubAllGlobals());

		it('switches the matrix view from its radio group', async () => {
			const ctx = makeCtx('by-group');
			render(TrainingPageView, { props: { ctx: ctx as unknown as TrainingPageContext, modals: new ModalRegistry() } });
			expect(screen.getByRole('button', { name: 'Group' }).getAttribute('aria-pressed')).toBe('true');
			await widths.foldAll();

			const menu = await openToolbarMore('Training controls');
			const views = within(menu).getByRole('group', { name: 'Training matrix view mode' });
			expect(within(views).getByRole('menuitemradio', { name: 'Group' }).getAttribute('aria-checked')).toBe('true');
			await fireEvent.click(within(views).getByRole('menuitemradio', { name: 'A-Z' }));

			expect(ctx.setViewMode).toHaveBeenCalledWith('alphabetical');
		});

		it('picks the saved view and the group from their submenus', async () => {
			trainingViewsStore.load(
				[
					{
						id: 'focus',
						name: 'Focus',
						columnIds: ['type-1'],
						createdBy: 'user',
						createdAt: '2026-01-01',
						updatedAt: '2026-01-01'
					}
				],
				'org-1'
			);
			const ctx = makeCtx('by-group');
			render(TrainingPageView, { props: { ctx: ctx as unknown as TrainingPageContext, modals: new ModalRegistry() } });
			await widths.foldAll();

			await openToolbarMore('Training controls');
			await openToolbarSubmenu('Training view, All Trainings');
			await fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Focus' }));
			expect(ctx.setSelectedViewId).toHaveBeenCalledWith('focus');

			await openToolbarMore('Training controls');
			await openToolbarSubmenu('Group, Group: All');
			await fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Bravo' }));
			expect(ctx.setSelectedGroupId).toHaveBeenCalledWith('group-2');
		});

		it('flags a hidden saved view or group filter on More', async () => {
			const ctx = makeCtx('by-group', { selectedGroupId: 'group-1' });
			render(TrainingPageView, { props: { ctx: ctx as unknown as TrainingPageContext, modals: new ModalRegistry() } });
			await widths.foldAll();

			const more = screen.getByRole('button', { name: 'More Training controls' });
			expect(toolbarDescription(more)).toBe('Hidden filters active: Group');
		});

		it('opens Sign-In Rosters and follows Reports from More', async () => {
			const modals = new ModalRegistry();
			const open = vi.spyOn(modals, 'open');
			render(TrainingPageView, {
				props: { ctx: makeCtx('by-group') as unknown as TrainingPageContext, modals }
			});
			await widths.foldAll();

			let menu = await openToolbarMore('Training controls');
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sign-In Rosters' }));
			await waitFor(() => expect(open).toHaveBeenCalledWith('sign-in-rosters'));

			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			menu = await openToolbarMore('Training controls');
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Reports' }));
			await waitFor(() => expect(goto).toHaveBeenCalledWith('/org/org-1/training/reports'));
		});

		it('exports from More with the same busy and disabled states as the row', async () => {
			const { filenames } = captureDownload();
			render(TrainingPageView, { props: { ctx: exportContext(), modals: new ModalRegistry() } });
			await widths.foldAll();

			const menu = await openToolbarMore('Training controls');
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Export Excel' }));

			await waitFor(() => expect(filenames).toHaveLength(1));
		});

		it('keeps the reason Export Excel is unavailable on its menu item', async () => {
			render(TrainingPageView, {
				props: {
					ctx: makeCtx('alphabetical', { filteredPersonnel: [] }) as unknown as TrainingPageContext,
					modals: new ModalRegistry()
				}
			});
			await widths.foldAll();

			const menu = await openToolbarMore('Training controls');
			const item = within(menu).getByRole('menuitem', { name: 'Export Excel' });
			expect(item.getAttribute('aria-disabled')).toBe('true');
			expect(item.getAttribute('title')).toBe('No personnel to export.');
		});

		it('offers a member without Training configuration no config command anywhere on the toolbar', async () => {
			const ctx = makeCtx('by-group', { canManageConfig: false });
			render(TrainingPageView, { props: { ctx: ctx as unknown as TrainingPageContext, modals: new ModalRegistry() } });
			await widths.foldAll();

			expect(screen.queryByRole('button', { name: 'Manage Types' })).toBeNull();
			expect(screen.queryByRole('link', { name: 'Manage Types' })).toBeNull();
			const menu = await openToolbarMore('Training controls');
			expect(within(menu).queryByRole('menuitem', { name: 'Manage Views' })).toBeNull();
			expect(within(menu).getByRole('menuitem', { name: 'Reports' })).toBeTruthy();
		});
	});
});
