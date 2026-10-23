import type { ChunkReply, RowCommitResult, RowId } from './types';
import type { SourceRow } from './rowModel';

export const COMMIT_CHUNK_SIZE = 500;
export const UNCONFIRMED_REASON = 'Not confirmed, check before re-importing.';

export interface PlannedChange<Change> {
	rowId: RowId;
	change: Change;
}
export interface CommitProgress {
	sent: number;
	total: number;
}
export interface NotImportedRow {
	row: SourceRow;
	reason: string;
}
export type CommitResult = RowCommitResult | { kind: 'not-confirmed' } | { kind: 'not-attempted'; reason: string };
export type CommitStop = { kind: 'refused'; message: string } | { kind: 'unconfirmed' } | null;
export interface CommitRun {
	results: ReadonlyMap<RowId, CommitResult>;
	stopped: CommitStop;
}
export interface Receipt {
	added: number;
	updated: number;
	skipped: number;
	unchanged: number;
	failed: number;
	notAttempted: number;
	unconfirmed: number;
	notImported: readonly NotImportedRow[];
	stopped: CommitStop;
	refreshError?: string;
}

export async function runCommit<Change>(
	changes: readonly PlannedChange<Change>[],
	commitChunk: (changes: readonly Change[]) => Promise<ChunkReply>,
	onProgress: (progress: CommitProgress) => void,
	isCurrent: () => boolean
): Promise<CommitRun> {
	const results = new Map<RowId, CommitResult>();
	let stopped: CommitStop = null;
	if (!isCurrent()) return { results, stopped };
	onProgress({ sent: 0, total: changes.length });
	for (let offset = 0; offset < changes.length; offset += COMMIT_CHUNK_SIZE) {
		if (!isCurrent()) break;
		const chunk = changes.slice(offset, offset + COMMIT_CHUNK_SIZE);
		let reply: ChunkReply;
		try {
			reply = await commitChunk(chunk.map((item) => item.change));
		} catch {
			reply = { kind: 'unconfirmed' };
		}
		if (!isCurrent()) return { results, stopped };
		if (reply.kind === 'saved' && reply.results.length !== chunk.length) reply = { kind: 'unconfirmed' };
		if (reply.kind === 'saved') {
			chunk.forEach((item, index) => results.set(item.rowId, reply.results[index]));
		} else {
			stopped = reply;
			for (const item of chunk)
				results.set(
					item.rowId,
					reply.kind === 'refused' ? { kind: 'failed', reason: reply.message } : { kind: 'not-confirmed' }
				);
			for (const item of changes.slice(offset + chunk.length))
				results.set(item.rowId, {
					kind: 'not-attempted',
					reason: 'Not attempted because an earlier chunk stopped the import.'
				});
		}
		onProgress({ sent: offset + chunk.length, total: changes.length });
		if (stopped) break;
	}
	return { results, stopped };
}

export function buildReceipt(
	reviewedSkipped: readonly NotImportedRow[],
	results: ReadonlyMap<RowId, CommitResult>,
	rowsById: ReadonlyMap<RowId, SourceRow>,
	stopped: CommitStop,
	unchanged = 0
): Receipt {
	const receipt: Receipt = {
		added: 0,
		updated: 0,
		skipped: reviewedSkipped.length,
		unchanged,
		failed: 0,
		notAttempted: 0,
		unconfirmed: 0,
		notImported: [],
		stopped
	};
	const notImported = new Map(reviewedSkipped.map((item) => [item.row.id, item]));
	for (const [id, result] of results) {
		if (result.kind === 'added') receipt.added++;
		else if (result.kind === 'updated') receipt.updated++;
		else if (result.kind === 'unchanged') receipt.unchanged++;
		else {
			if (result.kind === 'failed') receipt.failed++;
			else if (result.kind === 'not-confirmed') receipt.unconfirmed++;
			else receipt.notAttempted++;
			const row = rowsById.get(id);
			if (row)
				notImported.set(id, { row, reason: result.kind === 'not-confirmed' ? UNCONFIRMED_REASON : result.reason });
		}
	}
	return { ...receipt, notImported: [...rowsById.keys()].flatMap((id) => notImported.get(id) ?? []) };
}
