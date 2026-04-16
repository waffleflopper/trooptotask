import { describe, expect, it } from 'vitest';
import type {
	CriticalTasksSettings,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import { buildCriticalTasksMatrix, matchesCriticalTasksPersonnelSearch } from './criticalTasksMatrix';

function person(overrides: Partial<Personnel>): Personnel {
	return {
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-alpha',
		groupName: 'Alpha',
		...overrides
	};
}

function task(overrides: Partial<IctTask>): IctTask {
	return {
		id: 'task-1',
		taskCode: '181-105-1001',
		title: 'Perform tactical combat casualty care',
		description: null,
		mos: [],
		expirationMonths: null,
		sortOrder: 0,
		archivedAt: null,
		createdAt: '2026-04-01T12:00:00Z',
		...overrides
	};
}

function completion(overrides: Partial<PersonnelIctCompletion>): PersonnelIctCompletion {
	return {
		id: 'completion-1',
		personnelId: 'person-1',
		ictTaskId: 'task-1',
		completedAt: '2026-04-01',
		validationMethod: 'Demonstration',
		validatedBy: 'SFC Observer',
		notes: null,
		loggedBy: 'user-1',
		createdAt: '2026-04-01T12:00:00Z',
		...overrides
	};
}

const groups: Group[] = [
	{ id: 'group-alpha', name: 'Alpha', sortOrder: 0 },
	{ id: 'group-bravo', name: 'Bravo', sortOrder: 1 }
];

const settings: CriticalTasksSettings = {
	defaultExpirationMonths: 12,
	expiringSoonWarningDays: 60
};

describe('buildCriticalTasksMatrix', () => {
	it('builds active personnel rows and active task columns with MOS-applicable status cells', () => {
		const matrix = buildCriticalTasksMatrix({
			personnel: [
				person({ id: 'archived-person', lastName: 'Archived', archivedAt: '2026-04-01T12:00:00Z' }),
				person({ id: 'smith', lastName: 'Smith', mos: '68W', groupId: 'group-alpha', groupName: 'Alpha' }),
				person({ id: 'jones', lastName: 'Jones', mos: '', groupId: 'group-bravo', groupName: 'Bravo' })
			],
			tasks: [
				task({ id: 'archived-task', taskCode: 'Z', archivedAt: '2026-04-01T12:00:00Z' }),
				task({ id: 'universal', taskCode: 'B', title: 'Universal task', mos: [], sortOrder: 10 }),
				task({ id: 'medic', taskCode: 'A', title: 'Medic task', mos: ['68W'], sortOrder: 10 }),
				task({ id: 'infantry', taskCode: 'C', title: 'Infantry task', mos: ['11B'], sortOrder: 20 })
			],
			completions: [
				completion({
					id: 'old',
					personnelId: 'smith',
					ictTaskId: 'medic',
					completedAt: '2024-04-01',
					validatedBy: 'SFC Old'
				}),
				completion({
					id: 'new',
					personnelId: 'smith',
					ictTaskId: 'medic',
					completedAt: '2026-04-01',
					validatedBy: 'SFC Current'
				})
			],
			groups,
			settings,
			asOf: '2026-04-15',
			orgName: 'Test Unit'
		});

		expect(matrix.tasks.map((item) => item.id)).toEqual(['medic', 'universal', 'infantry']);
		expect(matrix.groups.map((group) => group.label)).toEqual(['Alpha', 'Bravo']);
		expect(matrix.rows.map((row) => row.person.id)).toEqual(['smith', 'jones']);
		expect(matrix.alphabeticalRows.map((row) => row.person.id)).toEqual(['jones', 'smith']);

		const smith = matrix.rows.find((row) => row.person.id === 'smith');
		expect(smith?.cells.map((cell) => [cell.task.id, cell.applicable, cell.statusInfo.status])).toEqual([
			['medic', true, 'current'],
			['universal', true, 'not-recorded'],
			['infantry', false, 'not-recorded']
		]);
		expect(smith?.cells.find((cell) => cell.task.id === 'medic')?.completion?.id).toBe('new');

		const jones = matrix.rows.find((row) => row.person.id === 'jones');
		expect(jones?.cells.map((cell) => [cell.task.id, cell.applicable])).toEqual([
			['medic', false],
			['universal', true],
			['infantry', false]
		]);
	});

	it('calculates visible status details and filters rows by group or readiness gaps', () => {
		const baseTasks = [
			task({ id: 'current', taskCode: 'A', title: 'Current task', mos: [], sortOrder: 0 }),
			task({ id: 'expiring', taskCode: 'B', title: 'Expiring task', mos: [], sortOrder: 1 }),
			task({ id: 'expired', taskCode: 'C', title: 'Expired task', mos: [], sortOrder: 2 }),
			task({ id: 'missing', taskCode: 'D', title: 'Missing task', mos: [], sortOrder: 3 })
		];
		const smith = person({ id: 'smith', lastName: 'Smith', groupId: 'group-alpha', groupName: 'Alpha' });
		const jones = person({ id: 'jones', lastName: 'Jones', groupId: 'group-bravo', groupName: 'Bravo' });
		const completions = [
			completion({ id: 'smith-current', personnelId: 'smith', ictTaskId: 'current', completedAt: '2025-09-01' }),
			completion({
				id: 'smith-expiring',
				personnelId: 'smith',
				ictTaskId: 'expiring',
				completedAt: '2025-05-01',
				validationMethod: 'Practical Exercise',
				validatedBy: 'SFC Validator'
			}),
			completion({ id: 'smith-expired', personnelId: 'smith', ictTaskId: 'expired', completedAt: '2025-04-01' }),
			...baseTasks.map((item) =>
				completion({
					id: `jones-${item.id}`,
					personnelId: 'jones',
					ictTaskId: item.id,
					completedAt: '2025-09-01'
				})
			)
		];

		const matrix = buildCriticalTasksMatrix({
			personnel: [smith, jones],
			tasks: baseTasks,
			completions,
			groups,
			settings,
			asOf: '2026-04-15',
			orgName: 'Test Unit'
		});

		expect(matrix.rows.find((row) => row.person.id === 'smith')?.cells.map((cell) => cell.statusInfo.status)).toEqual([
			'current',
			'expiring-soon',
			'expired',
			'not-recorded'
		]);
		expect(matrix.rows.find((row) => row.person.id === 'smith')?.cells[1].detailLabel).toBe(
			'Expiring task: expiring soon. Completed 2025-05-01. Expires 2026-05-01. Validated by SFC Validator via Practical Exercise.'
		);

		const gapsOnly = buildCriticalTasksMatrix({
			personnel: [smith, jones],
			tasks: baseTasks,
			completions,
			groups,
			settings,
			gapsOnly: true,
			asOf: '2026-04-15',
			orgName: 'Test Unit'
		});

		expect(gapsOnly.rows.map((row) => row.person.id)).toEqual(['smith']);
		expect(gapsOnly.tasks.map((item) => item.id)).toEqual(['expired', 'missing']);
		expect(gapsOnly.rows[0]?.cells.map((cell) => [cell.task.id, cell.statusInfo.status, cell.isGap])).toEqual([
			['expired', 'expired', true],
			['missing', 'not-recorded', true]
		]);

		const bravoOnly = buildCriticalTasksMatrix({
			personnel: [smith, jones],
			tasks: baseTasks,
			completions,
			groups,
			settings,
			selectedGroupId: 'group-bravo',
			asOf: '2026-04-15',
			orgName: 'Test Unit'
		});

		expect(bravoOnly.groups.map((group) => group.label)).toEqual(['Bravo']);
		expect(bravoOnly.rows.map((row) => row.person.id)).toEqual(['jones']);
		expect(bravoOnly.alphabeticalRows.map((row) => row.person.id)).toEqual(['jones']);
	});

	it('matches personnel search against name, rank, and MOS fields', () => {
		const subject = person({
			rank: 'SSG',
			firstName: 'Jordan',
			lastName: 'Baker',
			mos: '68W'
		});

		expect(matchesCriticalTasksPersonnelSearch(subject, '')).toBe(true);
		expect(matchesCriticalTasksPersonnelSearch(subject, 'baker')).toBe(true);
		expect(matchesCriticalTasksPersonnelSearch(subject, 'Jordan Baker')).toBe(true);
		expect(matchesCriticalTasksPersonnelSearch(subject, 'SSG')).toBe(true);
		expect(matchesCriticalTasksPersonnelSearch(subject, '68w')).toBe(true);
		expect(matchesCriticalTasksPersonnelSearch(subject, '11B')).toBe(false);
	});
});
