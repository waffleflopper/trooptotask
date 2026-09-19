// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import type { TrainingWorkspaceResult } from '$features/training/server/trainingWorkspaceBootstrap';
import type { TrainingReportData } from '$lib/server/core/useCases/trainingReportsQuery';

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

function makeTrainingReportData(rowCount = 1): TrainingReportData {
	return {
		dashboard: {
			readinessPercent: rowCount > 0 ? 100 : 0,
			statusCounts: { current: rowCount, warningYellow: 0, warningOrange: 0, expired: 0, notCompleted: 0 },
			worstTypes: [],
			groupComparison: [],
			typeBreakdown: []
		},
		detail: {
			rows:
				rowCount > 0
					? [
							{
								person: {
									id: 'person-1',
									firstName: 'Jane',
									lastName: 'Smith',
									rank: 'SGT',
									mos: '68W',
									clinicRole: 'Medic',
									groupId: 'group-1',
									groupName: 'Alpha'
								} as never,
								cells: [{ trainingTypeId: 'type-1', status: 'current', label: 'Current', date: '2026-01-01' }]
							}
						]
					: [],
			totalRows: rowCount,
			page: 1,
			pageSize: 25,
			totalPages: 1,
			sort: { column: 'name', direction: 'asc' }
		},
		trainingTypes: [
			{ id: 'type-1', name: 'CPR', color: '#22c55e' },
			{ id: 'type-2', name: 'SHARP', color: '#f59e0b' }
		],
		filterOptions: {
			groups: [{ id: 'group-1', name: 'Alpha', orgId: 'org-1', sortOrder: 0, pinned: false } as never],
			mos: ['68W'],
			roles: ['Medic'],
			ranks: ['SGT']
		}
	};
}

describe('training reports page', () => {
	beforeEach(() => {
		rosterStore.load([], 'org-stale');
		groupsStore.load([], 'org-stale');
		trainingTypesStore.load([], 'org-stale');
		personnelTrainingsStore.load([], 'org-stale');
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		rosterStore.load([], 'org-test-reset');
		groupsStore.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
		personnelTrainingsStore.load([], 'org-test-reset');
	});

	it('keeps the route loading state until current-org training stores hydrate', async () => {
		render(Page, {
			props: {
				data: {
					training: {
						data: Promise.resolve(makeDeferredBootstrap())
					}
				} as never
			}
		});

		expect(await screen.findByText('Loading training reports...')).toBeTruthy();
		expect(screen.queryByText('No training types configured. Create training types first.')).toBeNull();
	});

	it('renders from the server report without waiting for full training store hydration', async () => {
		render(Page, {
			props: {
				data: {
					training: {
						data: Promise.resolve(makeDeferredBootstrap())
					},
					trainingReport: {
						dashboard: {
							readinessPercent: 0,
							statusCounts: { current: 0, warningYellow: 0, warningOrange: 0, expired: 0, notCompleted: 0 },
							worstTypes: [],
							groupComparison: [],
							typeBreakdown: []
						},
						detail: {
							rows: [],
							totalRows: 0,
							page: 1,
							pageSize: 25,
							totalPages: 1,
							sort: { column: 'name', direction: 'asc' }
						},
						trainingTypes: [],
						filterOptions: { groups: [], mos: [], roles: [], ranks: [] }
					}
				}
			}
		});

		expect(await screen.findByText('No training types configured.')).toBeTruthy();
		expect(screen.getByText('Create training types first.')).toBeTruthy();
		expect(screen.queryByText('Loading training reports...')).toBeNull();
	});

	it('disables report actions when filters or export rows are unavailable', async () => {
		render(Page, {
			props: {
				data: {
					training: {
						data: Promise.resolve(makeDeferredBootstrap())
					},
					trainingReport: makeTrainingReportData(0)
				}
			}
		});

		expect((await screen.findByRole('button', { name: 'Clear filters' })).hasAttribute('disabled')).toBe(true);
		expect(screen.getByRole('button', { name: 'Export' }).hasAttribute('disabled')).toBe(true);
	});
});
