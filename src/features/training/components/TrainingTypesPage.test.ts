// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingTypesPage from './TrainingTypesPage.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import type { Personnel } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		isFullEditor: true,
		permissions: {
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canManageMembers: true
		},
		scopedGroupId: null,
		readOnly: false,
		affordanceForFeatureAction: () => ({
			allowed: true,
			visible: true,
			disabled: false,
			reason: 'allowed:capability',
			explanation: '',
			decision: {}
		})
	})
}));

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
	}
] as Personnel[];

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

describe('TrainingTypesPage', () => {
	beforeEach(() => {
		personnelStore.load(personnel, 'org-1');
		trainingTypesStore.load([trainingType], 'org-1');
	});

	afterEach(() => {
		cleanup();
		personnelStore.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
	});

	it('uses hydrated personnel when route bootstrap omits applicability source data', async () => {
		render(TrainingTypesPage, {
			props: {
				data: {
					training: {
						data: {
							trainingTypes: Promise.resolve([trainingType])
						}
					},
					personnel: []
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: '+ New Type' }));

		expect(screen.getAllByRole('checkbox', { name: 'Medic' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('checkbox', { name: '68W' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('checkbox', { name: 'SGT' }).length).toBeGreaterThan(0);
	});

	it('moves type management actions into the floating page toolbar', () => {
		render(TrainingTypesPage, {
			props: {
				data: {
					training: {
						data: {
							trainingTypes: Promise.resolve([trainingType])
						}
					},
					personnel
				}
			}
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Training type controls' });

		expect(toolbar).toBeTruthy();
		expect(screen.queryByTestId('page-toolbar')).toBeNull();
		expect(screen.getByRole('button', { name: '+ New Type' })).toBeTruthy();
		expect(screen.queryByText('1 configured')).toBeNull();
	});

	it('opens the create and edit forms from the page actions', async () => {
		render(TrainingTypesPage, {
			props: {
				data: {
					training: {
						data: {
							trainingTypes: Promise.resolve([trainingType])
						}
					},
					personnel
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: '+ New Type' }));
		expect(screen.getByText('New Training Type')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await fireEvent.click(screen.getByRole('button', { name: /^CPR 12mo/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		expect(screen.getByText('Edit Training Type')).toBeTruthy();
		expect(screen.getByDisplayValue('CPR')).toBeTruthy();
	});
});
