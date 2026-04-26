// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingPageView from './TrainingPageView.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { TrainingType } from '$features/training/training.types';
import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
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
	readOnly: boolean;
	canViewTraining: boolean;
	canEditTraining: boolean;
	trainingOverflowItems: unknown[];
	groups: Group[];
	selectedGroupId: string;
	setSelectedGroupId: ReturnType<typeof vi.fn>;
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
		readOnly: false,
		canViewTraining: true,
		canEditTraining: true,
		trainingOverflowItems: [],
		groups,
		selectedGroupId: '',
		setSelectedGroupId: vi.fn(),
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
		personnelStore.load(personnel, 'org-1');
		groupsStore.load(groups, 'org-1');
		trainingTypesStore.load([trainingType], 'org-1');
		trainingViewsStore.load([], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
		pinnedGroupsStore.load(['Alpha'], 'org-1');
	});

	afterEach(() => {
		cleanup();
		personnelStore.load([], 'org-test-reset');
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

	it('puts the matrix controls in the floating page toolbar', () => {
		render(TrainingPageView, {
			props: {
				ctx: makeCtx('by-group') as unknown as TrainingPageContext,
				modals: new ModalRegistry()
			}
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Training controls' });

		expect(toolbar).toBeTruthy();
		expect(screen.queryByTestId('page-toolbar')).toBeNull();
		expect(screen.getByLabelText('Training view filter')).toBeTruthy();
		expect(screen.getByLabelText('Training group filter')).toBeTruthy();
		expect(screen.getByRole('group', { name: 'Training matrix view mode' })).toBeTruthy();
	});

	it('keeps the loading skeleton while another orgs training stores are still on screen', () => {
		personnelStore.load(personnel, 'org-stale');
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
});
