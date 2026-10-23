import { describe, expect, it } from 'vitest';
import { buildReceipt, runCommit, UNCONFIRMED_REASON, type PlannedChange } from './commit';
import { buildSourceRows } from './rowModel';
import { personnelFile, personnelLane } from './importFlow.test-support';
import { detectLayout } from './workbookSource';

function plan(count: number) {
	const file = personnelFile(count);
	const lane = personnelLane();
	const rows = buildSourceRows(file, detectLayout(file, lane), lane);
	return { rows, changes: rows.map((row, index): PlannedChange<number> => ({ rowId: row.id, change: index })) };
}

describe('commit', () => {
	it('counts server-confirmed unchanged rows with reviewed unchanged rows and leaves them out of the download', async () => {
		const { rows, changes } = plan(3);
		const run = await runCommit(
			changes,
			async () => ({ kind: 'saved', results: [{ kind: 'added' }, { kind: 'updated' }, { kind: 'unchanged' }] }),
			() => {},
			() => true
		);

		expect(buildReceipt([], run.results, new Map(rows.map((row) => [row.id, row])), run.stopped, 2)).toEqual({
			added: 1,
			updated: 1,
			skipped: 0,
			unchanged: 3,
			failed: 0,
			notAttempted: 0,
			unconfirmed: 0,
			notImported: [],
			stopped: null
		});
	});

	it('sends sequential 500-row chunks and stops 1,001 changes at the unconfirmed second chunk', async () => {
		const { rows, changes } = plan(1001);
		const saved: number[] = [];
		const attempted: number[][] = [];
		const progress: number[] = [];
		const run = await runCommit(
			changes,
			async (chunk) => {
				attempted.push([...chunk]);
				if (chunk[0] === 500) return { kind: 'unconfirmed' };
				saved.push(...chunk);
				return {
					kind: 'saved',
					results: chunk.map((value) => (value === 1 ? { kind: 'updated' } : { kind: 'added' }))
				};
			},
			(state) => progress.push(state.sent),
			() => true
		);
		expect(attempted.map((chunk) => [chunk.length, chunk[0], chunk[chunk.length - 1]])).toEqual([
			[500, 0, 499],
			[500, 500, 999]
		]);
		expect(saved).toHaveLength(500);
		expect(saved[499]).toBe(499);
		expect(progress).toEqual([0, 500, 1000]);
		expect(run.results.get(rows[0].id)).toEqual({ kind: 'added' });
		expect(run.results.get(rows[1].id)).toEqual({ kind: 'updated' });
		expect(run.results.get(rows[500].id)).toEqual({ kind: 'not-confirmed' });
		expect(run.results.get(rows[1000].id)?.kind).toBe('not-attempted');
		const receipt = buildReceipt([], run.results, new Map(rows.map((row) => [row.id, row])), run.stopped, 2);
		expect([
			receipt.added,
			receipt.updated,
			receipt.skipped,
			receipt.unchanged,
			receipt.failed,
			receipt.unconfirmed,
			receipt.notAttempted
		]).toEqual([499, 1, 0, 2, 0, 500, 1]);
		expect(receipt.notImported[0]).toEqual({ row: rows[500], reason: UNCONFIRMED_REASON });
		expect(receipt.stopped).toEqual({ kind: 'unconfirmed' });
	});
	it('maps individual failures positionally and classifies refused and malformed replies honestly', async () => {
		const { rows, changes } = plan(2);
		const run = await runCommit(
			changes,
			async () => ({ kind: 'saved', results: [{ kind: 'failed', reason: 'Not allowed' }, { kind: 'updated' }] }),
			() => {},
			() => true
		);
		expect([...run.results.values()]).toEqual([{ kind: 'failed', reason: 'Not allowed' }, { kind: 'updated' }]);
		const receipt = buildReceipt(
			[{ row: rows[0], reason: 'Skipped' }],
			new Map([[rows[1].id, { kind: 'updated' }]]),
			new Map(rows.map((row) => [row.id, row])),
			null
		);
		expect([receipt.skipped, receipt.updated]).toEqual([1, 1]);
		const refused = await runCommit(
			changes,
			async () => ({ kind: 'refused', message: 'Permission denied' }),
			() => {},
			() => true
		);
		expect([...refused.results.values()]).toEqual([
			{ kind: 'failed', reason: 'Permission denied' },
			{ kind: 'failed', reason: 'Permission denied' }
		]);
		const malformed = await runCommit(
			changes,
			async () => ({ kind: 'saved', results: [{ kind: 'added' }] }),
			() => {},
			() => true
		);
		expect([...malformed.results.values()]).toEqual([{ kind: 'not-confirmed' }, { kind: 'not-confirmed' }]);
		const lost = await runCommit(
			changes,
			async () => {
				throw new Error('Lost connection');
			},
			() => {},
			() => true
		);
		expect(lost.stopped).toEqual({ kind: 'unconfirmed' });
	});
	it('drops stale replies and sends no further chunk after the generation changes', async () => {
		const { changes } = plan(1001);
		let current = true;
		const stored: number[] = [];
		const progress: number[] = [];
		const run = await runCommit(
			changes,
			async (chunk) => {
				stored.push(...chunk);
				current = false;
				return { kind: 'saved', results: chunk.map(() => ({ kind: 'added' })) };
			},
			(state) => progress.push(state.sent),
			() => current
		);
		expect(stored).toHaveLength(500);
		expect(stored[499]).toBe(499);
		expect(progress).toEqual([0]);
		expect(run.results.size).toBe(0);
	});
});
