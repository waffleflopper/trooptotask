import { describe, expect, it } from 'vitest';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import {
	countCompletionRecordsForTask,
	getActiveIctTasksForLibrary,
	isIctTaskApplicableToMos,
	parseMosApplicabilityInput
} from './ictTaskLibrary';

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

describe('ICT task library utilities', () => {
	it('treats empty MOS applicability as applying to all personnel MOS values', () => {
		expect(isIctTaskApplicableToMos(task({ mos: [] }), '68W')).toBe(true);
		expect(isIctTaskApplicableToMos(task({ mos: [] }), '')).toBe(true);
		expect(isIctTaskApplicableToMos(task({ mos: ['68W'] }), '')).toBe(false);
		expect(isIctTaskApplicableToMos(task({ mos: ['68W', '18D'] }), '68w')).toBe(true);
		expect(isIctTaskApplicableToMos(task({ mos: ['68W'] }), '11B')).toBe(false);
	});

	it('returns active library tasks ordered by configured sort order and task code', () => {
		const active = getActiveIctTasksForLibrary([
			task({ id: 'archived', taskCode: 'C', sortOrder: 0, archivedAt: '2026-04-02T12:00:00Z' }),
			task({ id: 'bravo', taskCode: 'B', sortOrder: 10 }),
			task({ id: 'alpha', taskCode: 'A', sortOrder: 10 }),
			task({ id: 'first', taskCode: 'Z', sortOrder: 1 })
		]);

		expect(active.map((item) => item.id)).toEqual(['first', 'alpha', 'bravo']);
	});

	it('normalizes comma and newline separated MOS applicability input', () => {
		expect(parseMosApplicabilityInput(' 68w, 18D\n68W ,, 11b ')).toEqual(['68W', '18D', '11B']);
		expect(parseMosApplicabilityInput('')).toEqual([]);
	});

	it('counts personnel completion records tied to a task before archive', () => {
		const completions = [
			{ id: 'c1', ictTaskId: 'task-1' },
			{ id: 'c2', ictTaskId: 'task-1' },
			{ id: 'c3', ictTaskId: 'task-2' }
		] as PersonnelIctCompletion[];

		expect(countCompletionRecordsForTask(completions, 'task-1')).toBe(2);
	});
});
