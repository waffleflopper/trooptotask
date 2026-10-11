// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import TrainingRoute from '../trainingRoute.test.svelte';
import { trainingTypesStore } from '$features/training';
import { personnelRosterHydration } from '$features/personnel';
import type { TrainingWorkspaceResult } from '$features/training/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/contracts';

vi.mock('$features/app-shell', () => {
	const capabilityRank = ['none', 'view', 'operate', 'configure'];
	const capabilityMap = {
		calendar: 'configure',
		personnel: 'configure',
		training: 'configure',
		onboarding: 'configure',
		members: 'configure',
		criticalTasks: 'configure',
		ratingScheme: 'configure',
		reports: 'configure'
	};
	const hasCapability = (feature: string, action: string) => {
		const value = capabilityMap[feature as keyof typeof capabilityMap];
		if (Array.isArray(value)) return value.includes(action);
		const actualRank = capabilityRank.indexOf(value);
		const requiredRank = capabilityRank.indexOf(action);
		return requiredRank >= 0 && actualRank >= requiredRank;
	};

	return {
		getAppShellContext: () => ({
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
		personnelRosterHydration.load([], 'org-stale');
		trainingTypesStore.load([], 'org-stale');
	});

	afterEach(() => {
		cleanup();
		personnelRosterHydration.load([], 'org-test-reset');
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
		personnelRosterHydration.load(personnel, 'org-1');
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

		expect(await screen.findByRole('row', { name: 'CPR' })).toBeTruthy();
		expect(screen.queryByText('Loading training types...')).toBeNull();
	});

	it('shows the Training load error with Retry and never a stuck loading status when the source rejects', async () => {
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });
		const rejected = Promise.reject(new Error('personnel_trainings failed'));
		rejected.catch(() => {});

		render(TrainingRoute, {
			props: { Page, data: { shell: { org: { id: 'org-1' } }, training: { data: rejected } } as never }
		});

		expect((await screen.findByRole('alert')).textContent).toContain('Unable to load Training');
		expect(screen.queryByRole('status')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry Training' }));
		expect(reload).toHaveBeenCalledTimes(1);
		vi.unstubAllGlobals();
	});
});
