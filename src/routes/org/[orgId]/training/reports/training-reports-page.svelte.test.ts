// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
import type { TrainingBootstrap } from '$lib/server/core/useCases/trainingQuery';
import type { TrainingReportData } from '$lib/server/core/useCases/trainingReportsQuery';

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
			canViewLeadersBook: true,
			canEditLeadersBook: true,
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

function makeTrainingReportData(rowCount = 1): TrainingReportData {
	return {
		dashboard: {
			readinessPercent: rowCount > 0 ? 100 : 0,
			statusCounts: { current: rowCount, warningYellow: 0, warningOrange: 0, expired: 0, notCompleted: 0 },
			worstTypes: [],
			groupComparison: []
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
		personnelStore.load([], 'org-stale');
		groupsStore.load([], 'org-stale');
		trainingTypesStore.load([], 'org-stale');
		personnelTrainingsStore.load([], 'org-stale');
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		personnelStore.load([], 'org-test-reset');
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
							groupComparison: []
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

		expect(await screen.findByText('No training types configured. Create training types first.')).toBeTruthy();
		expect(screen.queryByText('Loading training reports...')).toBeNull();
	});

	it('keeps report filters selected through reloads and clears them back to defaults', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => makeTrainingReportData()
		});
		vi.stubGlobal('fetch', fetchMock);

		render(Page, {
			props: {
				data: {
					training: {
						data: Promise.resolve(makeDeferredBootstrap())
					},
					trainingReport: makeTrainingReportData()
				}
			}
		});

		await fireEvent.change(await screen.findByLabelText('Filter by group'), { target: { value: 'group-1' } });
		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('groupId=group-1'));
		});
		expect((screen.getByLabelText('Filter by group') as HTMLSelectElement).value).toBe('group-1');

		await fireEvent.focus(screen.getByRole('combobox', { name: 'Filter by training type' }));
		await fireEvent.mouseDown(await screen.findByRole('option', { name: 'CPR' }));
		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('trainingTypeId=type-1'));
		});
		expect(screen.getByRole('button', { name: 'Remove CPR' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
		expect((screen.getByLabelText('Filter by group') as HTMLSelectElement).value).toBe('');
		expect(screen.queryByRole('button', { name: 'Remove CPR' })).toBeNull();
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

	it('puts personnel filters first as a collapsed group before report filters and actions', async () => {
		render(Page, {
			props: {
				data: {
					training: {
						data: Promise.resolve(makeDeferredBootstrap())
					},
					trainingReport: makeTrainingReportData()
				}
			}
		});

		const toolbar = await screen.findByRole('toolbar', { name: 'Training report controls' });
		const personnelFilters = within(toolbar).getByRole('button', { name: 'Personnel filters' });
		const groupFilter = within(toolbar).getByLabelText('Filter by group');
		const statusFilter = within(toolbar).getByLabelText('Filter by status');
		const typeFilter = within(toolbar).getByRole('combobox', { name: 'Filter by training type' });
		const clearFilters = within(toolbar).getByRole('button', { name: 'Clear filters' });
		const exportAction = within(toolbar).getByRole('button', { name: 'Export' });

		expect(personnelFilters.compareDocumentPosition(groupFilter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(groupFilter.compareDocumentPosition(statusFilter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(statusFilter.compareDocumentPosition(typeFilter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(typeFilter.compareDocumentPosition(clearFilters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(clearFilters.compareDocumentPosition(exportAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

		expect(within(toolbar).queryByLabelText('Filter by rank')).toBeNull();
		await fireEvent.click(personnelFilters);
		expect(await within(toolbar).findByLabelText('Filter by rank')).toBeTruthy();
		expect(within(toolbar).getByLabelText('Filter by MOS')).toBeTruthy();
		expect(within(toolbar).getByLabelText('Filter by duty role')).toBeTruthy();
	});
});
