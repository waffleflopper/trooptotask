// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import type { TrainingWorkspaceResult } from '$features/training/server/trainingWorkspaceBootstrap';
import type { Personnel } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';

vi.mock('$lib/stores/orgContext.svelte', () => {
	const capabilityRank = ['none', 'view', 'operate', 'configure'];
	const capabilityMap = {
		calendar: 'configure',
		personnel: 'configure',
		training: 'configure',
		onboarding: 'configure',
		members: 'configure',
		criticalTasks: 'configure',
		ratingScheme: 'configure',
		reports: 'configure',
		dutyRoster: 'configure'
	};
	const hasCapability = (feature: string, action: string) => {
		const value = capabilityMap[feature as keyof typeof capabilityMap];
		if (Array.isArray(value)) return value.includes(action);
		const actualRank = capabilityRank.indexOf(value);
		const requiredRank = capabilityRank.indexOf(action);
		return requiredRank >= 0 && actualRank >= requiredRank;
	};

	return {
		getOrgContext: () => ({
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: 'user-1',
			role: 'owner',
			isOwner: true,
			isAdmin: false,
			isPrivileged: true,
			capabilityMap,
			hasCapability,
			scopeSet: { kind: 'organization' },
			affordanceForFeatureAction: () => ({
				allowed: true,
				visible: true,
				disabled: false,
				reason: 'allowed:capability',
				explanation: '',
				decision: {}
			})
		})
	};
});

function makeDeferredBootstrap(): TrainingWorkspaceResult {
	const deferredItems = Promise.resolve([]);
	const data = {
		personnel: deferredItems,
		groups: deferredItems,
		trainingTypes: deferredItems,
		trainingViews: deferredItems,
		personnelTrainings: deferredItems,
		pinnedGroups: deferredItems
	};

	return {
		laneKey: 'training',
		data,
		hydration: {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: data.personnel },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: data.groups },
			trainingTypes: { mode: 'replace', snapshotKey: 'types:1', items: data.trainingTypes },
			trainingViews: { mode: 'replace', snapshotKey: 'views:1', items: data.trainingViews },
			personnelTrainings: { mode: 'replace', snapshotKey: 'trainings:1', items: data.personnelTrainings },
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: data.pinnedGroups }
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
