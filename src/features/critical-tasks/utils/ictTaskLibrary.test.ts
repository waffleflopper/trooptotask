import { describe, expect, it } from 'vitest';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import {
	countCompletionRecordsForTask,
	getActiveIctTasksForLibrary,
	isIctTaskApplicableToMos,
	parseMosApplicabilityInput,
	planIctTaskMove
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

describe('planIctTaskMove', () => {
	const library = (...entries: Array<[string, number]>) =>
		getActiveIctTasksForLibrary(entries.map(([taskCode, sortOrder]) => task({ id: taskCode, taskCode, sortOrder })));

	it('swaps two distinct sort orders and guards the preceding boundary', () => {
		expect(planIctTaskMove(library(['A', 1], ['B', 2], ['C', 3]), 1, 1)).toEqual({
			status: 'ready',
			changes: [
				{ id: 'A', expectedSortOrder: 1, sortOrder: 1 },
				{ id: 'C', expectedSortOrder: 3, sortOrder: 2 },
				{ id: 'B', expectedSortOrder: 2, sortOrder: 3 }
			]
		});
	});

	it('separates tied tasks with the fewest raised sort orders', () => {
		expect(planIctTaskMove(library(['A', 0], ['B', 0], ['C', 0], ['D', 1]), 0, 1)).toEqual({
			status: 'ready',
			changes: [
				{ id: 'B', expectedSortOrder: 0, sortOrder: 0 },
				{ id: 'A', expectedSortOrder: 0, sortOrder: 1 },
				{ id: 'C', expectedSortOrder: 0, sortOrder: 1 },
				{ id: 'D', expectedSortOrder: 1, sortOrder: 1 }
			]
		});
	});

	it('raises a later task whose code would otherwise sort before the moved task', () => {
		expect(planIctTaskMove(library(['X', 1], ['B', 2], ['C', 2]), 0, 1)).toEqual({
			status: 'ready',
			changes: [
				{ id: 'B', expectedSortOrder: 2, sortOrder: 1 },
				{ id: 'X', expectedSortOrder: 1, sortOrder: 2 },
				{ id: 'C', expectedSortOrder: 2, sortOrder: 3 }
			]
		});
	});

	it('guards crowded boundary chains even when only the first swap participant changes', () => {
		expect(planIctTaskMove(library(['A', 0], ['B', 1], ['C', 1], ['D', 4], ['E', 5]), 1, 1)).toEqual({
			status: 'ready',
			changes: [
				{ id: 'A', expectedSortOrder: 0, sortOrder: 0 },
				{ id: 'C', expectedSortOrder: 1, sortOrder: 1 },
				{ id: 'B', expectedSortOrder: 1, sortOrder: 2 },
				{ id: 'D', expectedSortOrder: 4, sortOrder: 4 },
				{ id: 'E', expectedSortOrder: 5, sortOrder: 5 }
			]
		});
	});

	it('keeps an ordinary local swap bounded in a large library', () => {
		const tasks = library(
			...Array.from({ length: 10000 }, (_, index): [string, number] => [
				`T${String(index).padStart(5, '0')}`,
				index * 10
			])
		);
		expect(planIctTaskMove(tasks, 5000, 1)).toEqual({
			status: 'ready',
			changes: [
				{ id: 'T04999', expectedSortOrder: 49990, sortOrder: 49990 },
				{ id: 'T05001', expectedSortOrder: 50010, sortOrder: 50000 },
				{ id: 'T05000', expectedSortOrder: 50000, sortOrder: 50010 },
				{ id: 'T05002', expectedSortOrder: 50020, sortOrder: 50020 }
			]
		});
	});

	it('stops boundary propagation at a gap of two', () => {
		expect(planIctTaskMove(library(['A', 0], ['B', 2], ['C', 4], ['D', 6], ['E', 8], ['F', 10]), 2, 1)).toEqual({
			status: 'ready',
			changes: [
				{ id: 'B', expectedSortOrder: 2, sortOrder: 2 },
				{ id: 'D', expectedSortOrder: 6, sortOrder: 4 },
				{ id: 'C', expectedSortOrder: 4, sortOrder: 6 },
				{ id: 'E', expectedSortOrder: 8, sortOrder: 8 }
			]
		});
	});

	it('plans nothing past either end of the library', () => {
		const tasks = library(['A', 0], ['B', 1]);
		expect([planIctTaskMove(tasks, 0, -1), planIctTaskMove(tasks, 1, 1)]).toEqual([
			{ status: 'ready', changes: [] },
			{ status: 'ready', changes: [] }
		]);
	});

	it('produces the swapped display order for every move in tied and gapped libraries', () => {
		const libraries = [
			library(['A', 0], ['B', 0], ['C', 0], ['D', 0]),
			library(['D', 0], ['C', 0], ['B', 1], ['A', 1], ['E', 1]),
			library(['A', 5], ['B', 5], ['C', 6], ['D', 9], ['E', 9])
		];
		for (const tasks of libraries) {
			for (let index = 0; index < tasks.length - 1; index += 1) {
				const plan = planIctTaskMove(tasks, index, 1);
				if (plan.status !== 'ready') throw new Error('Expected a supported move');
				const changes = new Map(plan.changes.map((change) => [change.id, change.sortOrder]));
				const moved = tasks.map((entry) => ({ ...entry, sortOrder: changes.get(entry.id) ?? entry.sortOrder }));
				const expected = tasks.map((entry) => entry.id);
				[expected[index], expected[index + 1]] = [expected[index + 1], expected[index]];
				expect(getActiveIctTasksForLibrary(moved).map((entry) => entry.id)).toEqual(expected);
			}
		}
	});

	describe('command bounds', () => {
		const zeroOrder = (count: number) =>
			library(
				...Array.from({ length: count }, (_, index): [string, number] => [`T${String(index).padStart(4, '0')}`, 0])
			);

		it('plans a move with exactly 1000 participants including its unchanged swap participant', () => {
			const plan = planIctTaskMove(zeroOrder(1000), 0, 1);

			expect(plan.status).toBe('ready');
			if (plan.status === 'ready') expect(plan.changes).toHaveLength(1000);
		});

		it('rejects 1001 participants rather than silently dropping a guard', () => {
			expect(planIctTaskMove(zeroOrder(1001), 0, 1)).toEqual({ status: 'unsupported' });
		});

		it.each([1000, 1001])('counts unchanged crowded guards toward the limit for %i participants', (count) => {
			const tasks = library(
				...Array.from({ length: count }, (_, index): [string, number] => [`T${String(index).padStart(4, '0')}`, index])
			);
			const before = structuredClone(tasks);
			const plan = planIctTaskMove(tasks, count - 2, 1);
			expect(plan.status).toBe(count === 1000 ? 'ready' : 'unsupported');
			if (plan.status === 'ready') {
				expect(plan.changes).toHaveLength(1000);
				expect(plan.changes.filter(({ sortOrder, expectedSortOrder }) => sortOrder !== expectedSortOrder)).toHaveLength(
					2
				);
			}
			expect(tasks).toEqual(before);
		});

		it('plans a move whose raised sort order is the largest the database stores', () => {
			expect(planIctTaskMove(library(['A', 2147483646], ['B', 2147483646]), 0, 1)).toEqual({
				status: 'ready',
				changes: [
					{ id: 'B', expectedSortOrder: 2147483646, sortOrder: 2147483646 },
					{ id: 'A', expectedSortOrder: 2147483646, sortOrder: 2147483647 }
				]
			});
		});

		it('reports a move that would raise a sort order past the database limit as unsupported', () => {
			expect(planIctTaskMove(library(['A', 2147483647], ['B', 2147483647]), 0, 1)).toEqual({ status: 'unsupported' });
		});
	});
});
