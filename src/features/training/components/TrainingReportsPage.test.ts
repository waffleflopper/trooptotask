// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingReportsPage from './TrainingReportsPage.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { groupsStore, type Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';
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
		readOnly: false
	})
}));

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

const secondaryTrainingType: TrainingType = {
	...trainingType,
	id: 'type-2',
	name: 'Weapons Qual',
	color: '#f59e0b',
	sortOrder: 1
};

function makeServerReport(
	person: Personnel,
	overrides: Partial<TrainingReportData['detail']> = {}
): TrainingReportData {
	return {
		dashboard: {
			readinessPercent: 50,
			statusCounts: {
				current: 1,
				warningYellow: 0,
				warningOrange: 0,
				expired: 0,
				notCompleted: 1
			},
			worstTypes: [],
			groupComparison: []
		},
		detail: {
			rows: [
				{
					person,
					cells: [
						{
							trainingTypeId: trainingType.id,
							status: 'current',
							label: 'Current',
							date: null
						}
					]
				}
			],
			totalRows: 2,
			page: 1,
			pageSize: 1,
			totalPages: 2,
			sort: { column: 'name', direction: 'asc' },
			...overrides
		},
		trainingTypes: [trainingType],
		filterOptions: {
			groups,
			mos: ['11B', '68W'],
			roles: ['Line', 'Medic'],
			ranks: ['SGT', 'SPC']
		}
	};
}

describe('TrainingReportsPage', () => {
	beforeEach(() => {
		personnelStore.load(personnel, 'org-1');
		groupsStore.load(groups, 'org-1');
		trainingTypesStore.load([trainingType], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		personnelStore.load([], 'org-test-reset');
		groupsStore.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
		personnelTrainingsStore.load([], 'org-test-reset');
	});

	it('uses hydrated personnel and groups when route bootstrap omits them', () => {
		render(TrainingReportsPage, {
			props: {
				data: {
					training: {
						data: {
							personnelTrainings: Promise.resolve([])
						}
					},
					personnel: [],
					groups: []
				}
			}
		});

		expect(screen.getByRole('option', { name: 'Alpha' })).toBeTruthy();
		expect(screen.getByText('Overall Readiness (2 personnel)')).toBeTruthy();
	});

	it('puts report filters and export in the floating page toolbar', () => {
		trainingTypesStore.load([trainingType, secondaryTrainingType], 'org-1');

		render(TrainingReportsPage, {
			props: {
				data: {
					training: {
						data: {
							personnelTrainings: Promise.resolve([])
						}
					},
					personnel,
					groups
				}
			}
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Training report controls' });

		expect(toolbar).toBeTruthy();
		expect(screen.queryByTestId('page-toolbar')).toBeNull();
		expect(screen.getByLabelText('Filter by group')).toBeTruthy();
		expect(screen.getByLabelText('Filter by status')).toBeTruthy();
		expect(screen.getByRole('combobox', { name: 'Filter by training type' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Export' }).classList.contains('btn-primary')).toBe(true);
		expect(screen.queryByText('2 personnel')).toBeNull();
	});

	it('collapses report filters into a shared filter group when the toolbar is narrow', async () => {
		trainingTypesStore.load([trainingType, secondaryTrainingType], 'org-1');

		render(TrainingReportsPage, {
			props: {
				toolbarContainerWidth: 520,
				data: {
					training: {
						data: {
							personnelTrainings: Promise.resolve([])
						}
					},
					personnel,
					groups
				}
			}
		});

		expect(screen.getByRole('button', { name: 'Personnel filters' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Report filters' })).toBeTruthy();
		expect(screen.queryByLabelText('Filter by group')).toBeNull();
		expect(screen.queryByLabelText('Filter by status')).toBeNull();
		expect(screen.queryByRole('combobox', { name: 'Filter by training type' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Report filters' }));
		const panel = screen.getByTestId('training-report-filters-panel');

		expect(within(panel).getByLabelText('Filter by group')).toBeTruthy();
		expect(within(panel).getByLabelText('Filter by status')).toBeTruthy();
		expect(within(panel).getByRole('combobox', { name: 'Filter by training type' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
	});

	it('filters training types with the tag-style multi-select', async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => makeServerReport(personnel[0])
		}));
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingReportsPage, {
			props: {
				data: {
					trainingReport: {
						...makeServerReport(personnel[1]),
						trainingTypes: [trainingType, secondaryTrainingType]
					}
				}
			}
		});

		await fireEvent.focus(screen.getByRole('combobox', { name: 'Filter by training type' }));
		await fireEvent.mouseDown(
			within(screen.getByRole('listbox', { name: 'Filter by training type' })).getByText('CPR')
		);

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Remove CPR' })).toBeTruthy();
			expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('trainingTypeId=type-1'));
		});
	});

	it('renders only the server-provided report page instead of rebuilding every store row', () => {
		render(TrainingReportsPage, {
			props: {
				data: {
					trainingReport: {
						dashboard: {
							readinessPercent: 50,
							statusCounts: {
								current: 1,
								warningYellow: 0,
								warningOrange: 0,
								expired: 0,
								notCompleted: 1
							},
							worstTypes: [],
							groupComparison: []
						},
						detail: {
							rows: [
								{
									person: personnel[1],
									cells: [
										{
											trainingTypeId: trainingType.id,
											status: 'not-completed',
											label: 'Not Done',
											date: null
										}
									]
								}
							],
							totalRows: 2,
							page: 1,
							pageSize: 1,
							totalPages: 2,
							sort: { column: 'name', direction: 'asc' }
						},
						trainingTypes: [trainingType],
						filterOptions: {
							groups,
							mos: ['11B', '68W'],
							roles: ['Line', 'Medic'],
							ranks: ['SGT', 'SPC']
						}
					}
				}
			}
		});

		expect(screen.getByText('Adams, John')).toBeTruthy();
		expect(screen.queryByText('Smith, Jane')).toBeNull();
	});

	it('fetches the next server report page when paginating detail rows', async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				dashboard: {
					readinessPercent: 50,
					statusCounts: {
						current: 1,
						warningYellow: 0,
						warningOrange: 0,
						expired: 0,
						notCompleted: 1
					},
					worstTypes: [],
					groupComparison: []
				},
				detail: {
					rows: [
						{
							person: personnel[0],
							cells: [
								{
									trainingTypeId: trainingType.id,
									status: 'not-completed',
									label: 'Not Done',
									date: null
								}
							]
						}
					],
					totalRows: 2,
					page: 2,
					pageSize: 1,
					totalPages: 2,
					sort: { column: 'name', direction: 'asc' }
				},
				trainingTypes: [trainingType],
				filterOptions: {
					groups,
					mos: ['11B', '68W'],
					roles: ['Line', 'Medic'],
					ranks: ['SGT', 'SPC']
				}
			})
		}));
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingReportsPage, {
			props: {
				data: {
					trainingReport: {
						dashboard: {
							readinessPercent: 50,
							statusCounts: {
								current: 1,
								warningYellow: 0,
								warningOrange: 0,
								expired: 0,
								notCompleted: 1
							},
							worstTypes: [],
							groupComparison: []
						},
						detail: {
							rows: [
								{
									person: personnel[1],
									cells: [
										{
											trainingTypeId: trainingType.id,
											status: 'current',
											label: 'Current',
											date: null
										}
									]
								}
							],
							totalRows: 2,
							page: 1,
							pageSize: 1,
							totalPages: 2,
							sort: { column: 'name', direction: 'asc' }
						},
						trainingTypes: [trainingType],
						filterOptions: {
							groups,
							mos: ['11B', '68W'],
							roles: ['Line', 'Medic'],
							ranks: ['SGT', 'SPC']
						}
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/training-reports?'));
			expect(((fetchMock.mock.calls.at(0) as unknown as [string]) ?? [''])[0]).toContain('page=2');
			expect(screen.getByText('Smith, Jane')).toBeTruthy();
		});
		expect(screen.queryByText('Adams, John')).toBeNull();
	});

	it('replaces a client-fetched report when fresh server report data arrives', async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => makeServerReport(personnel[0], { page: 2 })
		}));
		vi.stubGlobal('fetch', fetchMock);

		const view = render(TrainingReportsPage, {
			props: {
				data: {
					trainingReport: makeServerReport(personnel[1])
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		await waitFor(() => expect(screen.getByText('Smith, Jane')).toBeTruthy());

		await view.rerender({
			data: {
				trainingReport: makeServerReport(personnel[1], { totalRows: 1, totalPages: 1 })
			}
		});

		await waitFor(() => expect(screen.getByText('Adams, John')).toBeTruthy());
		expect(screen.queryByText('Smith, Jane')).toBeNull();
	});

	it('fetches a fresh server report page when filters change', async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				dashboard: {
					readinessPercent: 0,
					statusCounts: {
						current: 0,
						warningYellow: 0,
						warningOrange: 0,
						expired: 0,
						notCompleted: 1
					},
					worstTypes: [],
					groupComparison: []
				},
				detail: {
					rows: [
						{
							person: personnel[0],
							cells: [
								{
									trainingTypeId: trainingType.id,
									status: 'not-completed',
									label: 'Not Done',
									date: null
								}
							]
						}
					],
					totalRows: 1,
					page: 1,
					pageSize: 1,
					totalPages: 1,
					sort: { column: 'name', direction: 'asc' }
				},
				trainingTypes: [trainingType],
				filterOptions: {
					groups,
					mos: ['11B', '68W'],
					roles: ['Line', 'Medic'],
					ranks: ['SGT', 'SPC']
				}
			})
		}));
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingReportsPage, {
			props: {
				data: {
					trainingReport: {
						dashboard: {
							readinessPercent: 50,
							statusCounts: {
								current: 1,
								warningYellow: 0,
								warningOrange: 0,
								expired: 0,
								notCompleted: 1
							},
							worstTypes: [],
							groupComparison: []
						},
						detail: {
							rows: [
								{
									person: personnel[1],
									cells: [
										{
											trainingTypeId: trainingType.id,
											status: 'current',
											label: 'Current',
											date: null
										}
									]
								}
							],
							totalRows: 2,
							page: 1,
							pageSize: 1,
							totalPages: 2,
							sort: { column: 'name', direction: 'asc' }
						},
						trainingTypes: [trainingType],
						filterOptions: {
							groups,
							mos: ['11B', '68W'],
							roles: ['Line', 'Medic'],
							ranks: ['SGT', 'SPC']
						}
					}
				}
			}
		});

		await fireEvent.change(screen.getByLabelText('Filter by group'), { target: { value: 'group-1' } });

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('groupId=group-1'));
			expect(((fetchMock.mock.calls.at(0) as unknown as [string]) ?? [''])[0]).toContain('page=1');
			expect(screen.getByText('Smith, Jane')).toBeTruthy();
		});
	});

	it('keeps the latest server report when earlier requests resolve late', async () => {
		let resolveStaleResponse!: (response: Response) => void;
		let resolveLatestResponse!: (response: Response) => void;
		const staleResponse = new Promise<Response>((resolve) => {
			resolveStaleResponse = resolve;
		});
		const latestResponse = new Promise<Response>((resolve) => {
			resolveLatestResponse = resolve;
		});
		const reportResponse = (person: Personnel, totalRows: number) =>
			({
				ok: true,
				json: async () => ({
					dashboard: {
						readinessPercent: 0,
						statusCounts: {
							current: 0,
							warningYellow: 0,
							warningOrange: 0,
							expired: 0,
							notCompleted: 1
						},
						worstTypes: [],
						groupComparison: []
					},
					detail: {
						rows: [
							{
								person,
								cells: [
									{
										trainingTypeId: trainingType.id,
										status: 'not-completed',
										label: 'Not Done',
										date: null
									}
								]
							}
						],
						totalRows,
						page: 1,
						pageSize: 1,
						totalPages: totalRows,
						sort: { column: 'name', direction: 'asc' }
					},
					trainingTypes: [trainingType],
					filterOptions: {
						groups,
						mos: ['11B', '68W'],
						roles: ['Line', 'Medic'],
						ranks: ['SGT', 'SPC']
					}
				})
			}) as Response;
		const fetchMock = vi.fn((url: string) => (url.includes('groupId=group-1') ? latestResponse : staleResponse));
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingReportsPage, {
			props: {
				data: {
					trainingReport: {
						dashboard: {
							readinessPercent: 50,
							statusCounts: {
								current: 1,
								warningYellow: 0,
								warningOrange: 0,
								expired: 0,
								notCompleted: 1
							},
							worstTypes: [],
							groupComparison: []
						},
						detail: {
							rows: [
								{
									person: personnel[1],
									cells: [
										{
											trainingTypeId: trainingType.id,
											status: 'current',
											label: 'Current',
											date: null
										}
									]
								}
							],
							totalRows: 2,
							page: 1,
							pageSize: 1,
							totalPages: 2,
							sort: { column: 'name', direction: 'asc' }
						},
						trainingTypes: [trainingType],
						filterOptions: {
							groups,
							mos: ['11B', '68W'],
							roles: ['Line', 'Medic'],
							ranks: ['SGT', 'SPC']
						}
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

		await fireEvent.change(screen.getByLabelText('Filter by group'), { target: { value: 'group-1' } });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

		resolveLatestResponse(reportResponse(personnel[0], 1));
		await waitFor(() => expect(screen.getByText('Smith, Jane')).toBeTruthy());

		resolveStaleResponse(reportResponse(personnel[1], 2));
		await staleResponse;
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(screen.getByText('Smith, Jane')).toBeTruthy();
		expect(screen.queryByText('Adams, John')).toBeNull();
	});

	it('uses the server export endpoint for server-backed reports', async () => {
		const appendSpy = vi.spyOn(document.body, 'appendChild');
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		render(TrainingReportsPage, {
			props: {
				data: {
					trainingReport: {
						dashboard: {
							readinessPercent: 50,
							statusCounts: {
								current: 1,
								warningYellow: 0,
								warningOrange: 0,
								expired: 0,
								notCompleted: 1
							},
							worstTypes: [],
							groupComparison: []
						},
						detail: {
							rows: [
								{
									person: personnel[1],
									cells: [
										{
											trainingTypeId: trainingType.id,
											status: 'current',
											label: 'Current',
											date: null
										}
									]
								}
							],
							totalRows: 2,
							page: 1,
							pageSize: 1,
							totalPages: 2,
							sort: { column: 'name', direction: 'asc' }
						},
						trainingTypes: [trainingType],
						filterOptions: {
							groups,
							mos: ['11B', '68W'],
							roles: ['Line', 'Medic'],
							ranks: ['SGT', 'SPC']
						}
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Export' }));

		const appendedLinks = appendSpy.mock.calls
			.map(([node]) => node)
			.filter((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
		const exportLink = appendedLinks.at(-1);

		expect(exportLink?.href).toContain('/org/org-1/api/training-reports/export?');
		expect(exportLink?.href).toContain('sortColumn=name');
		expect(exportLink?.href).toContain('sortDirection=asc');
		expect(exportLink?.href).not.toContain('page=');
	});
});
