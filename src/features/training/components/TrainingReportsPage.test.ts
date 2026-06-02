// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingReportsPage from './TrainingReportsPage.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
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
		scopeSet: { kind: 'organization' },
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
			groupComparison: [],
			typeBreakdown: []
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
		rosterStore.load(personnel, 'org-1');
		groupsStore.load(groups, 'org-1');
		trainingTypesStore.load([trainingType], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		rosterStore.load([], 'org-test-reset');
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

		expect(screen.getByText('Training Readiness')).toBeTruthy();
		expect(screen.getByText(/across 2 personnel/)).toBeTruthy();
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
							groupComparison: [],
							typeBreakdown: []
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
					groupComparison: [],
					typeBreakdown: []
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
							groupComparison: [],
							typeBreakdown: []
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

	it('uses the server export endpoint for server-backed reports', async () => {
		const exportBlob = new Blob(['training workbook'], {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		});
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'Content-Disposition': 'attachment; filename="training-report.xlsx"' }),
			blob: () => Promise.resolve(exportBlob)
		});
		const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:training-export');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		vi.stubGlobal('fetch', fetchMock);
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
							groupComparison: [],
							typeBreakdown: []
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

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const exportUrl = fetchMock.mock.calls[0]?.[0] as string;
		expect(exportUrl).toContain('/org/org-1/api/training-reports/export?');
		expect(exportUrl).toContain('sortColumn=name');
		expect(exportUrl).toContain('sortDirection=asc');
		expect(exportUrl).not.toContain('page=');
		expect(createObjectURL).toHaveBeenCalledWith(exportBlob);
	});
});
