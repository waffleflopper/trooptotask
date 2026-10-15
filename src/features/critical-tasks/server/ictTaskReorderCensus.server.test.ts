import { stdout } from 'node:process';
import { expect, it } from 'vitest';
import type { IctTask } from '../criticalTasks.types';
import { getActiveIctTasksForLibrary, planIctTaskMove } from '../utils/ictTaskLibrary';
import { createWritePortsContext } from './criticalTasksPersistence.test-support.server';
import { reorderIctTasks } from './ictTaskOperations.server';

const codes = ['task-10', 'task-2', '11B', 'Z', 'alpha', 'Á'];
const cases = [
	{ count: 4, orders: [0, 1, 2] },
	{ count: 5, orders: [0, 1, 2] },
	{ count: 6, orders: [0, 1, 2] },
	{ count: 5, orders: [0, 1, 5] },
	{ count: 6, orders: [0, 1, 5] },
	{ count: 6, orders: [0, 1, 2, 5] },
	{ count: 5, orders: [0, 2, 4, 9] },
	{ count: 6, orders: [0, 1, 5], codes }
];

it.each(cases)(
	'serializes every ordered pair of adjacent moves for $count tasks with orders $orders and codes $codes',
	async ({ count, orders, codes }) => {
		const totals = { assignments: orders.length ** count, schedules: 0, accepted: 0, refused: 0, failures: 0 };
		const failuresByEdges: Record<string, number> = {};
		const examples: unknown[] = [];
		const moves = Array.from({ length: count - 1 }, (_, edge) => [
			{ index: edge, direction: 1 as const },
			{ index: edge + 1, direction: -1 as const }
		]).flat();
		for (let assignment = 0; assignment < totals.assignments; assignment += 1) {
			const rows = Array.from({ length: count }, (_, index) => ({
				id: String.fromCharCode(65 + index),
				organization_id: 'test-org',
				task_code: codes?.[index] ?? String.fromCharCode(65 + index),
				title: 'Synthetic census task',
				sort_order: orders[Math.floor(assignment / orders.length ** index) % orders.length],
				archived_at: null,
				updated_at: 'retained'
			}));
			for (const first of moves) {
				for (const second of moves) {
					totals.schedules += 1;
					const ctx = createWritePortsContext();
					ctx.rawStore.seed('ict_tasks', structuredClone(rows));
					const tasks = getActiveIctTasksForLibrary(await ctx.criticalTaskLibrary.listCatalog());
					const plans = [first, second].map((move) => planIctTaskMove(tasks, move.index, move.direction));
					const [firstPlan, secondPlan] = plans;
					if (firstPlan.status !== 'ready' || secondPlan.status !== 'ready')
						throw new Error('Small census move unsupported');
					await reorderIctTasks(ctx, { changes: firstPlan.changes });
					const winnerRows = structuredClone(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId));
					const winnerAuditCount = ctx.audit.events.length;
					const winner = getActiveIctTasksForLibrary(await ctx.criticalTaskLibrary.listCatalog()).map(
						(task) => task.id
					);
					const expectedWinner = tasks.map((task) => task.id);
					[expectedWinner[first.index], expectedWinner[first.index + first.direction]] = [
						expectedWinner[first.index + first.direction],
						expectedWinner[first.index]
					];
					const pair = [tasks[second.index].id, tasks[second.index + second.direction].id];
					const positions = pair.map((id) => winner.indexOf(id));
					const adjacent = positions[1] - positions[0] === second.direction;
					const expected = [...winner];
					[expected[positions[0]], expected[positions[1]]] = [expected[positions[1]], expected[positions[0]]];
					let status = 200;
					try {
						await reorderIctTasks(ctx, { changes: secondPlan.changes });
						totals.accepted += 1;
					} catch (error) {
						if (typeof error !== 'object' || error === null || !('status' in error) || error.status !== 409)
							throw error;
						status = 409;
						totals.refused += 1;
					}
					const actual = getActiveIctTasksForLibrary(await ctx.criticalTaskLibrary.listCatalog()).map(
						(task) => task.id
					);
					const unchanged =
						JSON.stringify(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId)) === JSON.stringify(winnerRows) &&
						ctx.audit.events.length === winnerAuditCount;
					const valid =
						JSON.stringify(winner) === JSON.stringify(expectedWinner) &&
						(status === 200 ? adjacent && JSON.stringify(actual) === JSON.stringify(expected) : unchanged);
					if (!valid) {
						totals.failures += 1;
						const distance = Math.abs(
							Math.min(first.index, first.index + first.direction) -
								Math.min(second.index, second.index + second.direction)
						);
						const relation = distance === 0 ? 'same' : distance === 1 ? 'overlapping' : 'disjoint';
						failuresByEdges[relation] = (failuresByEdges[relation] ?? 0) + 1;
						if (examples.length < 5)
							examples.push({
								initial: tasks.map(({ id, sortOrder }) => [id, sortOrder]),
								first,
								second,
								plans,
								winner,
								pair,
								adjacent,
								status,
								actual,
								expected
							});
					}
				}
			}
		}
		stdout.write(`${JSON.stringify({ count, orders, codes, ...totals, failuresByEdges, examples })}\n`);
		expect(totals.accepted + totals.refused).toBe(totals.schedules);
		expect(totals.failures).toBe(0);
	},
	300000
);

it.each([
	{
		entries: [
			['B', 0],
			['C', 0],
			['D', 1],
			['A', 2]
		],
		first: 0,
		second: 2,
		winner: ['C', 'B', 'D', 'A']
	},
	{
		entries: [
			['B', 0],
			['D', 0],
			['A', 1],
			['E', 1],
			['C', 2]
		],
		first: 1,
		second: 3,
		winner: ['B', 'A', 'D', 'E', 'C']
	}
])('refuses the stale disjoint move after edge $first wins in $entries', async ({ entries, first, second, winner }) => {
	const ctx = createWritePortsContext();
	ctx.rawStore.seed(
		'ict_tasks',
		entries.map(([id, sort_order]) => ({
			id,
			task_code: id,
			title: id,
			sort_order,
			organization_id: 'test-org',
			archived_at: null
		}))
	);
	const tasks: IctTask[] = getActiveIctTasksForLibrary(await ctx.criticalTaskLibrary.listCatalog());
	const firstPlan = planIctTaskMove(tasks, first, 1);
	const secondPlan = planIctTaskMove(tasks, second, 1);
	if (firstPlan.status !== 'ready' || secondPlan.status !== 'ready') throw new Error('Expected supported moves');
	await reorderIctTasks(ctx, { changes: firstPlan.changes });
	await expect(reorderIctTasks(ctx, { changes: secondPlan.changes })).rejects.toMatchObject({ status: 409 });
	expect(getActiveIctTasksForLibrary(await ctx.criticalTaskLibrary.listCatalog()).map(({ id }) => id)).toEqual(winner);
});

it('allows independent gapped moves to commute', async () => {
	const ctx = createWritePortsContext();
	ctx.rawStore.seed(
		'ict_tasks',
		['A', 'B', 'C', 'D', 'E', 'F'].map((id, index) => ({
			id,
			task_code: id,
			title: id,
			sort_order: index * 10,
			organization_id: 'test-org',
			archived_at: null
		}))
	);
	const tasks = getActiveIctTasksForLibrary(await ctx.criticalTaskLibrary.listCatalog());
	const first = planIctTaskMove(tasks, 0, 1);
	const second = planIctTaskMove(tasks, 4, 1);
	if (first.status !== 'ready' || second.status !== 'ready') throw new Error('Expected supported moves');
	await reorderIctTasks(ctx, { changes: first.changes });
	await reorderIctTasks(ctx, { changes: second.changes });
	expect(getActiveIctTasksForLibrary(await ctx.criticalTaskLibrary.listCatalog()).map(({ id }) => id)).toEqual([
		'B',
		'A',
		'C',
		'D',
		'F',
		'E'
	]);
});
