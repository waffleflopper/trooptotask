import { describe, expect, it } from 'vitest';
import { reviewIctCompletionImportRows, type IctCompletionImportReview } from './ictCompletionImport';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';

const alphaMedic: Personnel = {
	id: 'person-alpha-medic',
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'Jane',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: 'group-alpha',
	groupName: 'Alpha',
	archivedAt: null
};

const bravoMedic: Personnel = {
	...alphaMedic,
	id: 'person-bravo-medic',
	rank: 'SPC',
	groupId: 'group-bravo',
	groupName: 'Bravo'
};

const archivedMedic: Personnel = {
	...alphaMedic,
	id: 'person-archived-medic',
	archivedAt: '2026-04-14T12:00:00Z'
};

const smithLeader: Personnel = {
	...alphaMedic,
	id: 'person-smith-leader',
	firstName: 'John',
	rank: 'SFC'
};

const tcccTask: IctTask = {
	id: 'task-tccc',
	taskCode: '181-105-1001',
	title: 'Perform tactical combat casualty care',
	description: null,
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 1,
	archivedAt: null,
	createdAt: '2026-04-01T00:00:00Z'
};

const airwayTask: IctTask = {
	...tcccTask,
	id: 'task-airway',
	taskCode: '081-833-0010',
	title: 'Open an airway'
};

const archivedTask: IctTask = {
	...tcccTask,
	id: 'task-archived',
	taskCode: '181-105-1999',
	title: 'Archived task',
	archivedAt: '2026-04-14T12:00:00Z'
};

function existingCompletion(overrides: Partial<PersonnelIctCompletion> = {}): PersonnelIctCompletion {
	return {
		id: 'completion-existing',
		personnelId: alphaMedic.id,
		ictTaskId: tcccTask.id,
		completedAt: '2026-03-01',
		validationMethod: 'Lecture',
		validatedBy: 'MSG Example',
		notes: 'Previous record',
		loggedBy: 'user-1',
		createdAt: '2026-03-01T12:00:00Z',
		...overrides
	};
}

function expectReviewRows(review: IctCompletionImportReview) {
	return {
		valid: review.validRows.map((row) => row.rowNumber),
		invalid: review.invalidRows.map((row) => row.rowNumber),
		ambiguous: review.ambiguousRows.map((row) => row.rowNumber)
	};
}

describe('ICT completion import review', () => {
	it('maps a valid spreadsheet row to a normalized completion payload', () => {
		const review = reviewIctCompletionImportRows(
			[
				['Rank', 'Last Name', 'First Name', 'Task Code', 'Completion Date', 'Validator', 'Notes'],
				[' sgt ', ' smith ', ' jane ', ' 181-105-1001 ', ' 3/13/2026 ', 'SFC Taylor Example', ' Lane validation ']
			],
			{
				personnel: [alphaMedic, bravoMedic, smithLeader],
				tasks: [tcccTask, airwayTask],
				existingCompletions: [existingCompletion()]
			}
		);

		expect(expectReviewRows(review)).toEqual({
			valid: [2],
			invalid: [],
			ambiguous: []
		});
		expect(review.validRows).toEqual([
			{
				rowNumber: 2,
				completionId: null,
				personnelId: 'person-alpha-medic',
				ictTaskId: 'task-tccc',
				personnel: alphaMedic,
				task: tcccTask,
				completion: {
					personnelId: 'person-alpha-medic',
					ictTaskId: 'task-tccc',
					completedAt: '2026-03-13',
					validationMethod: 'Other',
					validatedBy: 'SFC Taylor Example',
					notes: 'Lane validation'
				}
			}
		]);
	});

	it('reuses an existing completion when the import row matches the same person, task, and date', () => {
		const review = reviewIctCompletionImportRows(
			[
				['Rank', 'Last Name', 'First Name', 'Task Code', 'Completion Date', 'Validation Method'],
				['SGT', 'Smith', 'Jane', '181-105-1001', '2026-03-01', 'Lecture']
			],
			{
				personnel: [alphaMedic],
				tasks: [tcccTask],
				existingCompletions: [existingCompletion()]
			}
		);

		expect(expectReviewRows(review)).toEqual({
			valid: [2],
			invalid: [],
			ambiguous: []
		});
		expect(review.validRows[0]).toEqual(
			expect.objectContaining({
				completionId: 'completion-existing',
				personnelId: 'person-alpha-medic',
				ictTaskId: 'task-tccc'
			})
		);
	});

	it('uses rank when present to disambiguate otherwise-colliding personnel matches', () => {
		const review = reviewIctCompletionImportRows(
			[
				['Rank', 'First Name', 'Last Name', 'Task Code', 'Completion Date', 'Validation Method'],
				['SPC', 'Jane', 'Smith', '181-105-1001', '2026-04-14', 'Simulation']
			],
			{
				personnel: [alphaMedic, bravoMedic],
				tasks: [tcccTask],
				existingCompletions: []
			}
		);

		expect(expectReviewRows(review)).toEqual({
			valid: [2],
			invalid: [],
			ambiguous: []
		});
		expect(review.validRows[0]).toEqual(
			expect.objectContaining({
				personnelId: 'person-bravo-medic',
				ictTaskId: 'task-tccc',
				completion: expect.objectContaining({
					completedAt: '2026-04-14',
					validationMethod: 'Simulation'
				})
			})
		);
	});

	it('separates ambiguous personnel matches for review when rank is missing', () => {
		const review = reviewIctCompletionImportRows(
			[
				['Last Name', 'First Name', 'Task Code', 'Completion Date'],
				['Smith', 'Jane', '181-105-1001', '2026-04-14']
			],
			{
				personnel: [alphaMedic, bravoMedic],
				tasks: [tcccTask],
				existingCompletions: []
			}
		);

		expect(expectReviewRows(review)).toEqual({
			valid: [],
			invalid: [],
			ambiguous: [2]
		});
		expect(review.ambiguousRows).toEqual([
			expect.objectContaining({
				rowNumber: 2,
				values: expect.objectContaining({
					firstName: 'Jane',
					lastName: 'Smith',
					taskCode: '181-105-1001'
				}),
				errors: ['Multiple personnel records match this row. Add rank or correct the name values.'],
				matches: [
					{ personnelId: 'person-alpha-medic', displayName: 'SGT Jane Smith' },
					{ personnelId: 'person-bravo-medic', displayName: 'SPC Jane Smith' }
				]
			})
		]);
	});

	it('flags invalid rows before commit when required fields or task codes do not resolve', () => {
		const review = reviewIctCompletionImportRows(
			[
				['Last Name', 'First Name', 'Task Code', 'Completion Date', 'Validation Method'],
				['Smith', 'Jane', '', '2026-04-14', 'Lecture'],
				['Smith', 'Jane', 'UNKNOWN-001', '2026-04-14', 'Lecture'],
				['Smith', 'Jane', '181-105-1999', '2026-04-14', 'Lecture'],
				['Smith', 'Jane', '181-105-1001', 'not-a-date', 'Lecture'],
				['Smith', 'Jane', '181-105-1001', '2026-04-14', 'Bad Method']
			],
			{
				personnel: [alphaMedic],
				tasks: [tcccTask, archivedTask],
				existingCompletions: []
			}
		);

		expect(expectReviewRows(review)).toEqual({
			valid: [],
			invalid: [2, 3, 4, 5, 6],
			ambiguous: []
		});
		expect(review.invalidRows).toEqual([
			expect.objectContaining({
				rowNumber: 2,
				errors: ['Task code is required']
			}),
			expect.objectContaining({
				rowNumber: 3,
				errors: ['Task code "UNKNOWN-001" does not match an existing critical task']
			}),
			expect.objectContaining({
				rowNumber: 4,
				errors: ['Task code "181-105-1999" is archived and cannot receive new completion imports']
			}),
			expect.objectContaining({
				rowNumber: 5,
				errors: ['Completion date must be a valid date']
			}),
			expect.objectContaining({
				rowNumber: 6,
				errors: ['Validation method must match one of the supported ICT validation methods']
			})
		]);
	});

	it('flags archived personnel rows before commit so imports only target active records', () => {
		const review = reviewIctCompletionImportRows(
			[
				['Rank', 'Last Name', 'First Name', 'Task Code', 'Completion Date'],
				['SGT', 'Smith', 'Jane', '181-105-1001', '2026-04-14']
			],
			{
				personnel: [archivedMedic],
				tasks: [tcccTask],
				existingCompletions: []
			}
		);

		expect(expectReviewRows(review)).toEqual({
			valid: [],
			invalid: [2],
			ambiguous: []
		});
		expect(review.invalidRows).toEqual([
			expect.objectContaining({
				rowNumber: 2,
				errors: ['Personnel record is archived and cannot receive new completion imports.']
			})
		]);
	});

	it('flags unmatched personnel rows before commit when the person cannot be resolved', () => {
		const review = reviewIctCompletionImportRows(
			[
				['Rank', 'Last Name', 'First Name', 'Task Code', 'Completion Date'],
				['SSG', 'Unknown', 'Pat', '181-105-1001', '2026-04-14']
			],
			{
				personnel: [alphaMedic, bravoMedic],
				tasks: [tcccTask],
				existingCompletions: []
			}
		);

		expect(expectReviewRows(review)).toEqual({
			valid: [],
			invalid: [2],
			ambiguous: []
		});
		expect(review.invalidRows).toEqual([
			expect.objectContaining({
				rowNumber: 2,
				values: expect.objectContaining({
					rank: 'SSG',
					firstName: 'Pat',
					lastName: 'Unknown'
				}),
				errors: ['Personnel record not found. Check the rank, first name, and last name values.']
			})
		]);
	});
});
