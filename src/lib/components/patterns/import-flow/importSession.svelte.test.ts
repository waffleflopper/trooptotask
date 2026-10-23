import { SvelteMap } from 'svelte/reactivity';
import { describe, expect, it, vi } from 'vitest';
import { ImportSession } from './importSession.svelte';
import { personnelLane, type PersonnelChange } from './importFlow.test-support';
import { questionKey, type ChunkReply, type CreateOptionResult } from './types';
import { headerKey } from './workbookSource';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
const csv = (rank = 'SGT') => new File([`Last name,First name,Rank\nSmith,Alex,${rank}`], 'personnel.csv');

describe('import session', () => {
	it('prepares a corrected row again and holds the import until that finishes', async () => {
		const read = deferred<void>();
		const prepared: unknown[][] = [];
		const committed: PersonnelChange[] = [];
		const lane = {
			...personnelLane(),
			async beforeReview(rows: readonly { rank?: string }[]) {
				prepared.push(rows.map((row) => row.rank));
				if (prepared.length > 1) await read.promise;
			},
			async commitChunk(changes: readonly PersonnelChange[]): Promise<ChunkReply> {
				committed.push(...changes);
				return { kind: 'saved', results: changes.map(() => ({ kind: 'added' as const })) };
			}
		};
		const session = new ImportSession(() => lane);
		await session.chooseFile([csv('SGT')]);
		session.goTo('review');
		await vi.waitFor(() => expect(session.phase.step).toBe('review'));

		session.editCell(session.sourceRows[0].id, 'rank', 'CPL');
		expect(prepared).toEqual([['SGT'], ['CPL']]);
		await session.commit();
		expect(committed).toEqual([]);

		read.resolve();
		await vi.waitFor(() => expect(session.commitBlocker).toBeNull());
		await session.commit();
		expect(committed.map((change) => change.rank)).toEqual(['CPL']);
	});

	it('keeps the first repeated header value and lets the user continue', async () => {
		const lane = personnelLane();
		const session = new ImportSession(() => lane);
		await session.chooseFile([new File(['Last name,First name,Last name,Rank\nSmith,Alex,Jones,SGT'], 'HQ.csv')]);
		expect(session.columnBlockers).toEqual([]);
		session.goTo('review');
		expect(session.phase.step).toBe('review');
		expect(session.review.rows[0]).toMatchObject({ outcome: 'new', change: { name: 'Smith, Alex' } });
	});
	it.each(['direct', 'split'] as const)(
		'blocks Continue for a hand-mapped %s collision and names the field and sheet',
		async (mapping) => {
			const lane = personnelLane();
			const session = new ImportSession(() => lane);
			await session.chooseFile([new File(['Last name,First name,Rank,Extra\nSmith,Alex,SGT,Jones'], 'HQ.csv')]);
			session.setColumnTarget(
				headerKey('Extra'),
				mapping === 'direct' ? { kind: 'field', field: 'lastName' } : { kind: 'split', splitter: 0 }
			);
			expect(session.columnBlockers.some((message) => message.includes('Last name') && message.includes('HQ'))).toBe(
				true
			);
			session.goTo('review');
			expect(session.phase.step).toBe('columns');
			session.setColumnTarget(headerKey('Extra'), { kind: 'ignore' });
			expect(session.columnBlockers).toEqual([]);
			session.goTo('review');
			expect(session.phase.step).toBe('review');
		}
	);
	it('loads columns, guards navigation, edits a row, and produces an honest receipt', async () => {
		const lane = personnelLane();
		const stored: PersonnelChange[] = [];
		const session = new ImportSession(() => ({
			...lane,
			commitChunk: async (changes: readonly PersonnelChange[]): Promise<ChunkReply> => {
				stored.push(...changes);
				return { kind: 'saved', results: [{ kind: 'added' }] };
			}
		}));
		session.goTo('review');
		expect(session.phase.step).toBe('file');
		await session.chooseFile([csv()]);
		expect(session.phase.step).toBe('columns');
		expect(session.columnBlockers).toEqual([]);
		session.goTo('review');
		const row = session.sourceRows[0];
		session.editCell(row.id, 'mos', '68V');
		await session.commit();
		expect(stored).toEqual([{ name: 'Smith, Alex', rank: 'SGT', group: null, mos: '68V', ets: null }]);
		expect(session.phase).toMatchObject({
			step: 'done',
			receipt: { added: 1, updated: 0, failed: 0, unconfirmed: 0, notAttempted: 0 }
		});
		expect(session.dirty).toBe(false);
	});
	it('waits for the lane to prepare the parsed rows before opening Review', async () => {
		const lane = personnelLane();
		const loading = deferred<void>();
		const prepared: unknown[] = [];
		const session = new ImportSession(() => ({
			...lane,
			beforeReview: (rows: readonly unknown[]) => {
				prepared.push(...rows);
				return loading.promise;
			}
		}));
		await session.chooseFile([new File(['Last name,First name,Rank,ETS\nSmith,Alex,SGT,15MAR28'], 'HQ.csv')]);
		session.goTo('review');
		expect(session.phase).toEqual({ step: 'columns', preparing: true });
		expect(prepared).toEqual([{ lastName: 'Smith', firstName: 'Alex', rank: 'SGT', ets: '2028-03-15' }]);
		loading.resolve();
		await loading.promise;
		await Promise.resolve();
		expect(session.phase).toEqual({ step: 'review' });
	});
	it('keeps Columns open with the reason when preparing fails, and a retry opens Review', async () => {
		const lane = personnelLane();
		let attempts = 0;
		const session = new ImportSession(() => ({
			...lane,
			beforeReview: async () => {
				attempts++;
				if (attempts === 1) throw new Error('Saved entries could not be loaded.');
			}
		}));
		await session.chooseFile([csv()]);
		session.goTo('review');
		await Promise.resolve();
		await Promise.resolve();
		expect(session.phase).toEqual({ step: 'columns', error: 'Saved entries could not be loaded.' });
		session.goTo('review');
		await Promise.resolve();
		await Promise.resolve();
		expect(session.phase).toEqual({ step: 'review' });
	});
	it('drops a prepare that finishes after the user went back to File', async () => {
		const lane = personnelLane();
		const loading = deferred<void>();
		const session = new ImportSession(() => ({ ...lane, beforeReview: () => loading.promise }));
		await session.chooseFile([csv()]);
		session.goTo('review');
		session.goTo('file');
		loading.resolve();
		await loading.promise;
		await Promise.resolve();
		expect(session.phase.step).toBe('file');
	});
	it('blocks Review when no rows sit under the header', async () => {
		const lane = personnelLane();
		const session = new ImportSession(() => lane);
		await session.chooseFile([new File(['Last name,First name,Rank\n'], 'header.csv')]);
		expect(session.columnBlockers).toEqual(['No rows under the header row.']);
		session.goTo('review');
		expect(session.phase.step).toBe('columns');
	});
	it('discards a late file read after a different file is chosen', async () => {
		const pending = deferred<string>();
		const first = csv();
		Object.defineProperty(first, 'text', { value: () => pending.promise });
		const lane = personnelLane();
		const session = new ImportSession(() => lane);
		const reading = session.chooseFile([first]);
		await session.chooseFile([new File(['Last name,First name,Rank\nJones,Pat,CPL'], 'new.csv')]);
		pending.resolve('Last name,First name,Rank\nStale,Alex,SGT');
		await reading;
		expect(session.file?.name).toBe('new.csv');
		expect(session.review.rows[0]).toMatchObject({ outcome: 'new', change: { name: 'Jones, Pat', rank: 'CPL' } });
	});
	it('creates through the reference and picks the new option only in the current session', async () => {
		const pending = deferred<CreateOptionResult<string>>();
		const base = personnelLane();
		const created: string[] = [];
		const lane = {
			...base,
			references: {
				rank: {
					...base.references.rank,
					create: async (name: string) => {
						created.push(name);
						return pending.promise;
					}
				}
			}
		};
		const source = new SvelteMap([['lane', lane]]);
		const session = new ImportSession(() => source.get('lane') ?? lane);
		await session.chooseFile([csv('Sgt.')]);
		session.goTo('review');
		const key = questionKey({ reference: 'rank', key: 'sgt.' });
		const creating = session.createOption(key, 'Sergeant');
		await session.createOption(key, 'Sergeant');
		expect(created).toEqual(['Sergeant']);
		expect(session.creating.has(key)).toBe(true);
		const option = { id: 'sergeant', label: 'Sergeant', value: 'SGT' };
		source.set('lane', {
			...lane,
			references: { rank: { ...lane.references.rank, options: [...lane.references.rank.options, option] } }
		});
		pending.resolve({ kind: 'created', option });
		expect(await creating).toBeNull();
		expect(session.answers.get(key)).toEqual({ kind: 'pick', optionId: 'sergeant' });
		expect(session.review.rows[0]).toMatchObject({ outcome: 'new', change: { rank: 'SGT' } });
		expect(session.creating.has(key)).toBe(false);
	});
	it('resolves a created option before the lane lists it', async () => {
		const base = personnelLane();
		const option = { id: 'sergeant', label: 'Sergeant', value: 'SGT' };
		const lane = {
			...base,
			references: {
				rank: { ...base.references.rank, create: async () => ({ kind: 'created' as const, option }) }
			}
		};
		const session = new ImportSession(() => lane);
		await session.chooseFile([csv('Sgt.')]);
		session.goTo('review');
		const key = questionKey({ reference: 'rank', key: 'sgt.' });
		expect(await session.createOption(key, 'Sergeant')).toBeNull();
		expect(session.review.rows[0]).toMatchObject({ outcome: 'new', change: { rank: 'SGT' } });
	});
	it('drops stale create and commit continuations after start over', async () => {
		const pending = deferred<CreateOptionResult<string>>();
		const committed = deferred<ChunkReply>();
		const refreshes: string[] = [];
		const base = personnelLane();
		const lane = {
			...base,
			references: { rank: { ...base.references.rank, create: () => pending.promise } },
			commitChunk: () => committed.promise,
			afterCommit: async () => {
				refreshes.push('refreshed');
			}
		};
		const session = new ImportSession(() => lane);
		await session.chooseFile([csv('Sgt.')]);
		session.goTo('review');
		const key = questionKey({ reference: 'rank', key: 'sgt.' });
		const creating = session.createOption(key, 'Sergeant');
		session.startOver();
		pending.resolve({ kind: 'created', option: { id: 'new', label: 'Sergeant', value: 'SGT' } });
		await creating;
		expect(session.answers.size).toBe(0);
		expect(session.phase.step).toBe('file');
		await session.chooseFile([csv()]);
		session.goTo('review');
		const commit = session.commit();
		expect(session.phase.step).toBe('committing');
		session.startOver();
		committed.resolve({ kind: 'saved', results: [{ kind: 'added' }] });
		await commit;
		expect(refreshes).toEqual([]);
		expect(session.phase).toEqual({ step: 'file', error: null, reading: false });
	});
	it('keeps the receipt if the post-commit refresh fails', async () => {
		const base = personnelLane();
		const session = new ImportSession(() => ({
			...base,
			afterCommit: async () => {
				throw new Error('Refresh failed');
			}
		}));
		await session.chooseFile([csv()]);
		session.goTo('review');
		await session.commit();
		expect(session.phase).toMatchObject({ step: 'done', receipt: { added: 1, refreshError: 'Refresh failed' } });
	});
	it('drops a post-commit refresh that completes after reset and prevents repeated commits', async () => {
		const refreshed = deferred<void>();
		const started = deferred<void>();
		const stored: PersonnelChange[] = [];
		const base = personnelLane();
		const lane = {
			...base,
			commitChunk: async (changes: readonly PersonnelChange[]): Promise<ChunkReply> => {
				stored.push(...changes);
				return { kind: 'saved', results: changes.map(() => ({ kind: 'added' })) };
			},
			afterCommit: async () => {
				started.resolve();
				return refreshed.promise;
			}
		};
		const session = new ImportSession(() => lane);
		await session.chooseFile([csv()]);
		session.goTo('review');
		const committing = session.commit();
		await session.commit();
		await started.promise;
		expect(stored).toEqual([{ name: 'Smith, Alex', rank: 'SGT', group: null, mos: null, ets: null }]);
		session.startOver();
		refreshed.resolve();
		await committing;
		expect(session.phase).toEqual({ step: 'file', error: null, reading: false });
	});
});
