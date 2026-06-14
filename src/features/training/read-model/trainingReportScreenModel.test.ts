import { describe, expect, it } from 'vitest';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { TrainingReportData } from '$lib/server/core/useCases/trainingReportsQuery';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
import {
	buildTrainingReportDetailUrl,
	buildTrainingReportExportUrl,
	buildTrainingReportScreenModel,
	buildTrainingReportUrl,
	createEmptyTrainingReportFilters,
	type TrainingReportFilterState
} from './trainingReportScreenModel';

const groups: Group[] = [
	{ id: 'group-1', name: 'Alpha', sortOrder: 0 },
	{ id: 'group-2', name: 'Bravo', sortOrder: 1 }
];

function makePerson(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-1',
		groupName: 'Alpha',
		...overrides
	};
}

function makeType(overrides: Partial<TrainingType> = {}): TrainingType {
	return {
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
		isOptional: false,
		...overrides
	};
}

function makeTraining(overrides: Partial<PersonnelTraining> = {}): PersonnelTraining {
	return {
		id: 'training-1',
		personnelId: 'person-1',
		trainingTypeId: 'type-1',
		completionDate: '2026-01-01',
		expirationDate: '2999-01-01',
		notes: null,
		certificateUrl: null,
		...overrides
	};
}

function makeServerReport(person: Personnel): TrainingReportData {
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
							trainingTypeId: 'type-1',
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
		trainingTypes: [{ id: 'type-1', name: 'CPR', color: '#22c55e' }],
		filterOptions: {
			groups,
			mos: ['11B', '68W'],
			roles: ['Line', 'Medic'],
			ranks: ['SGT', 'SPC']
		}
	};
}

function withFilters(overrides: Partial<TrainingReportFilterState>): TrainingReportFilterState {
	return {
		...createEmptyTrainingReportFilters(),
		...overrides
	};
}

describe('buildTrainingReportScreenModel', () => {
	it('pre-shapes local training report rows, columns, filters, and dashboard values', () => {
		const personnel = [
			makePerson(),
			makePerson({
				id: 'person-2',
				rank: 'SPC',
				lastName: 'Adams',
				firstName: 'John',
				mos: '11B',
				clinicRole: 'Line',
				groupId: 'group-2',
				groupName: 'Bravo'
			})
		];
		const trainingTypes = [makeType(), makeType({ id: 'type-2', name: 'CLS' })];
		const model = buildTrainingReportScreenModel({
			activeReport: null,
			serverReport: null,
			personnel,
			groups,
			trainingTypes,
			localTrainingTypes: trainingTypes,
			trainings: [makeTraining()],
			filters: withFilters({ groupId: 'group-1', status: 'current', trainingTypeIds: ['type-1'] }),
			sort: { column: 'name', ascending: true }
		});

		expect(model.detailPersonnelCount).toBe(1);
		expect(model.pivotRows.map((row) => row.person.id)).toEqual(['person-1']);
		expect(model.reportColumns.map((column) => column.header)).toEqual(['Name', 'Rank', 'Group', 'CPR']);
		expect(model.dashboard.readinessPercent).toBe(100);
		expect(model.reportFilterCount).toBe(3);
		expect(model.hasActiveFilters).toBe(true);
	});

	it('uses server report detail rows and filter options without rebuilding local rows', () => {
		const serverReport = makeServerReport(makePerson({ id: 'server-person', lastName: 'Server' }));
		const model = buildTrainingReportScreenModel({
			activeReport: serverReport,
			serverReport,
			personnel: [makePerson(), makePerson({ id: 'person-2', lastName: 'Adams' })],
			groups: [],
			trainingTypes: [makeType()],
			localTrainingTypes: [makeType()],
			trainings: [makeTraining()],
			filters: createEmptyTrainingReportFilters(),
			sort: { column: 'rank', ascending: false }
		});

		expect(model.pivotRows).toHaveLength(1);
		expect(model.pivotRows[0].person.id).toBe('server-person');
		expect(model.detailPersonnelCount).toBe(2);
		expect(model.allGroups.map((group) => group.name)).toEqual(['Alpha', 'Bravo']);
		expect(model.dashboard.readinessPercent).toBe(50);
	});
});

describe('training report URL helpers', () => {
	it('encodes report filters, sort, and pagination for server page requests', () => {
		const url = buildTrainingReportUrl({
			orgId: 'org-1',
			filters: withFilters({
				groupId: 'group 1',
				mos: '68W',
				role: 'Flight Medic',
				rank: 'SGT',
				status: 'expired',
				trainingTypeIds: ['type-1', 'type 2']
			}),
			sort: { column: 'name', ascending: false },
			page: 2,
			pageSize: 25
		});
		const params = new URLSearchParams(url.split('?')[1]);

		expect(url).toContain('/org/org-1/api/training-reports?');
		expect(params.get('groupId')).toBe('group 1');
		expect(params.get('role')).toBe('Flight Medic');
		expect(params.get('status')).toBe('expired');
		expect(params.getAll('trainingTypeId')).toEqual(['type-1', 'type 2']);
		expect(params.get('sortDirection')).toBe('desc');
		expect(params.get('page')).toBe('2');
		expect(params.get('pageSize')).toBe('25');
	});

	it('keeps pagination out of server export URLs', () => {
		const url = buildTrainingReportExportUrl({
			orgId: 'org-1',
			filters: withFilters({ status: 'current' }),
			sort: { column: 'name', ascending: true }
		});
		const params = new URLSearchParams(url.split('?')[1]);

		expect(url).toContain('/org/org-1/api/training-reports/export?');
		expect(params.get('status')).toBe('current');
		expect(params.get('sortColumn')).toBe('name');
		expect(params.get('sortDirection')).toBe('asc');
		expect(params.has('page')).toBe(false);
		expect(params.has('pageSize')).toBe(false);
	});

	it('encodes report filters, sort, and pagination for detail page requests', () => {
		const url = buildTrainingReportDetailUrl({
			orgId: 'org-1',
			filters: withFilters({ status: 'not-completed', trainingTypeIds: ['type-1'] }),
			sort: { column: 'type-1', ascending: true },
			page: 3,
			pageSize: 50
		});
		const params = new URLSearchParams(url.split('?')[1]);

		expect(url).toContain('/org/org-1/api/training-reports/detail?');
		expect(params.get('status')).toBe('not-completed');
		expect(params.getAll('trainingTypeId')).toEqual(['type-1']);
		expect(params.get('sortColumn')).toBe('type-1');
		expect(params.get('sortDirection')).toBe('asc');
		expect(params.get('page')).toBe('3');
		expect(params.get('pageSize')).toBe('50');
	});
});
