// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingPageView from './TrainingPageView.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { TrainingType } from '$features/training/training.types';
import { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
import TrainingModals from './TrainingModals.svelte';
import { createTestOrgContext } from '$lib/test-support/orgContextBuilder';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: vi.fn()
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
	trainingOverflowItems: unknown[];
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
		trainingOverflowItems: [],
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
		rosterStore.load(personnel, 'org-1');
		groupsStore.load(groups, 'org-1');
		trainingTypesStore.load([trainingType], 'org-1');
		trainingViewsStore.load([], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
		pinnedGroupsStore.load(['Alpha'], 'org-1');
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.useRealTimers();
		rosterStore.load([], 'org-test-reset');
		groupsStore.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
		trainingViewsStore.load([], 'org-test-reset');
		personnelTrainingsStore.load([], 'org-test-reset');
		pinnedGroupsStore.load([], 'org-test-reset');
	});

	it.each([['alphabetical'], ['by-group']] as const)('mounts only one matrix for %s view mode', (viewMode) => {
		render(TrainingPageView, {
			props: {
				ctx: makeCtx(viewMode) as unknown as TrainingPageContext,
				modals: new ModalRegistry()
			}
		});

		expect(screen.getAllByRole('table', { name: 'Training status matrix', hidden: true })).toHaveLength(1);
	});

	it('keeps the loading skeleton while another orgs training stores are still on screen', () => {
		rosterStore.load(personnel, 'org-stale');
		groupsStore.load(groups, 'org-stale');
		trainingTypesStore.load([trainingType], 'org-stale');
		personnelTrainingsStore.load([], 'org-stale');

		render(TrainingPageView, {
			props: {
				ctx: makeCtx('by-group', {
					orgId: 'org-2',
					groups: [],
					filteredPersonnel: []
				}) as unknown as TrainingPageContext,
				modals: new ModalRegistry()
			}
		});

		expect(screen.getByTestId('skeleton-grid')).toBeTruthy();
		expect(screen.queryByText('No personnel found.')).toBeNull();
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
			createTestOrgContext({ orgId: 'org-1' })
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
});
