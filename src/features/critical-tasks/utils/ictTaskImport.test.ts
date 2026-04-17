import { describe, expect, it } from 'vitest';
import { reviewIctTaskImportRows } from './ictTaskImport';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';

const existingTask: IctTask = {
	id: 'task-existing',
	taskCode: '181-105-1001',
	title: 'Old task title',
	description: 'Old description',
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 8,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

const archivedTask: IctTask = {
	...existingTask,
	id: 'task-archived',
	archivedAt: '2026-04-14T12:00:00Z'
};

describe('ICT task library import review', () => {
	it('maps a valid CSV row to a normalized create payload', () => {
		const review = reviewIctTaskImportRows(
			[
				['Task Code', 'Title', 'Description', 'MOS', 'Expiration Months', 'Sort Order'],
				[' 181-105-1001 ', ' Perform tactical combat casualty care ', ' Aid under fire ', '68w, 18D', '12', '4']
			],
			{
				existingTasks: [],
				mode: 'create-only',
				nextSortOrder: 0
			}
		);

		expect(review.invalidRows).toEqual([]);
		expect(review.validRows).toEqual([
			{
				rowNumber: 2,
				action: 'create',
				restoresArchivedTask: false,
				taskId: null,
				task: {
					taskCode: '181-105-1001',
					title: 'Perform tactical combat casualty care',
					description: 'Aid under fire',
					mos: ['68W', '18D'],
					expirationMonths: 12,
					sortOrder: 4,
					archivedAt: null
				}
			}
		]);
	});

	it("maps MOS values from common spreadsheet headers like MOS's", () => {
		const review = reviewIctTaskImportRows(
			[
				['Task Code', 'Title', "MOS's"],
				['181-105-1006', 'Treat casualties', '68W, 18D']
			],
			{
				existingTasks: [],
				mode: 'create-only',
				nextSortOrder: 0
			}
		);

		expect(review.invalidRows).toEqual([]);
		expect(review.validRows).toEqual([
			expect.objectContaining({
				rowNumber: 2,
				task: expect.objectContaining({
					taskCode: '181-105-1006',
					title: 'Treat casualties',
					mos: ['68W', '18D']
				})
			})
		]);
	});

	it('separates invalid rows with validation messages before save', () => {
		const review = reviewIctTaskImportRows(
			[
				['Task Code', 'Title', 'MOS', 'Expiration Months'],
				['', 'Missing code', '68W', '12'],
				['181-105-1002', '', '68W', '12'],
				['181-105-1003', 'Bad MOS', '68 W', '12'],
				['181-105-1004', 'Bad expiration', '68W', '0'],
				['181-105-1005', 'Duplicate one', '68W', '12'],
				['181-105-1005', 'Duplicate two', '68W', '12']
			],
			{
				existingTasks: [],
				mode: 'create-only',
				nextSortOrder: 0
			}
		);

		expect(review.validRows).toEqual([]);
		expect(review.invalidRows).toEqual([
			expect.objectContaining({
				rowNumber: 2,
				errors: ['Task code is required']
			}),
			expect.objectContaining({
				rowNumber: 3,
				errors: ['Title is required']
			}),
			expect.objectContaining({
				rowNumber: 4,
				errors: ['MOS contains invalid code "68 W"']
			}),
			expect.objectContaining({
				rowNumber: 5,
				errors: ['Expiration months must be a positive whole number']
			}),
			expect.objectContaining({
				rowNumber: 6,
				values: expect.objectContaining({
					taskCode: '181-105-1005',
					title: 'Duplicate one'
				}),
				errors: ['Duplicate task code "181-105-1005" also appears on row 7 ("Duplicate two")']
			}),
			expect.objectContaining({
				rowNumber: 7,
				values: expect.objectContaining({
					taskCode: '181-105-1005',
					title: 'Duplicate two'
				}),
				errors: ['Duplicate task code "181-105-1005" also appears on row 6 ("Duplicate one")']
			})
		]);
	});

	it('uses the selected import behavior for existing task codes', () => {
		const rows = [
			['Task Code', 'Title', 'MOS'],
			['181-105-1001', 'Updated task title', '18D']
		];

		expect(
			reviewIctTaskImportRows(rows, {
				existingTasks: [existingTask],
				mode: 'create-only',
				nextSortOrder: 0
			}).invalidRows
		).toEqual([
			expect.objectContaining({
				rowNumber: 2,
				errors: ['Task code already exists']
			})
		]);

		expect(
			reviewIctTaskImportRows(rows, {
				existingTasks: [existingTask],
				mode: 'upsert',
				nextSortOrder: 0
			}).validRows
		).toEqual([
			expect.objectContaining({
				rowNumber: 2,
				action: 'update',
				restoresArchivedTask: false,
				taskId: 'task-existing',
				task: expect.objectContaining({
					taskCode: '181-105-1001',
					title: 'Updated task title',
					mos: ['18D'],
					sortOrder: 8
				})
			})
		]);
	});

	it('preserves existing optional fields when an upsert omits those columns', () => {
		const review = reviewIctTaskImportRows(
			[
				['Task Code', 'Title'],
				['181-105-1001', 'Updated task title']
			],
			{
				existingTasks: [existingTask],
				mode: 'upsert',
				nextSortOrder: 0
			}
		);

		expect(review.validRows).toEqual([
			expect.objectContaining({
				action: 'update',
				restoresArchivedTask: false,
				taskId: 'task-existing',
				task: expect.objectContaining({
					title: 'Updated task title',
					description: 'Old description',
					mos: ['68W'],
					expirationMonths: 12,
					sortOrder: 8
				})
			})
		]);
	});

	it('flags archived task-code conflicts in create-only mode and marks restores in upsert mode', () => {
		const rows = [
			['Task Code', 'Title', 'MOS'],
			['181-105-1001', 'Restored title', '18D']
		];

		expect(
			reviewIctTaskImportRows(rows, {
				existingTasks: [archivedTask],
				mode: 'create-only',
				nextSortOrder: 0
			}).invalidRows
		).toEqual([
			expect.objectContaining({
				rowNumber: 2,
				errors: [
					'Task code exists on an archived task. Switch import behavior to create, update, or restore by task code.'
				]
			})
		]);

		expect(
			reviewIctTaskImportRows(rows, {
				existingTasks: [archivedTask],
				mode: 'upsert',
				nextSortOrder: 0
			}).validRows
		).toEqual([
			expect.objectContaining({
				rowNumber: 2,
				action: 'update',
				restoresArchivedTask: true,
				taskId: 'task-archived',
				task: expect.objectContaining({
					taskCode: '181-105-1001',
					title: 'Restored title',
					mos: ['18D'],
					archivedAt: null
				})
			})
		]);
	});
});
