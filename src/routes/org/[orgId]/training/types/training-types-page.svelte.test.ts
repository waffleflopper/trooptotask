// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
import type { TrainingBootstrap } from '$lib/server/core/orgShell';
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
		scopeSet: { kind: 'organization' },
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

function makeDeferredBootstrap(): WorkspaceBootstrap<TrainingBootstrap> {
	const deferredItems = Promise.resolve([]);

	return {
		workspace: 'training',
		data: {
			personnel: deferredItems,
			groups: deferredItems,
			trainingTypes: deferredItems,
			trainingViews: deferredItems,
			personnelTrainings: deferredItems,
			pinnedGroups: deferredItems
		}
	};
}

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

describe('training types page', () => {
	beforeEach(() => {
		rosterStore.load([], 'org-stale');
		trainingTypesStore.load([], 'org-stale');
	});

	afterEach(() => {
		cleanup();
		rosterStore.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
	});

	it('keeps the route loading state until current-org training type stores hydrate', async () => {
		render(Page, {
			props: {
				data: {
					training: {
						data: Promise.resolve(makeDeferredBootstrap())
					}
				}
			}
		});

		expect(await screen.findByText('Loading training types...')).toBeTruthy();
		expect(screen.queryByText('No training types yet. Create one to get started.')).toBeNull();
	});

	it('renders the resolved page once current-org stores hydrate', async () => {
		rosterStore.load(personnel, 'org-1');
		trainingTypesStore.load([trainingType], 'org-1');

		render(Page, {
			props: {
				data: {
					training: {
						data: Promise.resolve(makeDeferredBootstrap())
					}
				}
			}
		});

		expect(await screen.findByRole('button', { name: /^CPR 12mo/ })).toBeTruthy();
		expect(screen.queryByText('Loading training types...')).toBeNull();
	});
});
