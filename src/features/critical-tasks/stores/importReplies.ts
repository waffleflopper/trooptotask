import type { ChunkReply, RowCommitResult } from '$lib/components/patterns/import-flow';
import type { ImportChunkReply } from '$lib/utils/importChunkRequest';
import type { IctImportReply } from '../contracts';

export function adoptImportReply<T>(
	reply: ImportChunkReply<IctImportReply<T>>,
	merge: (added: T[], updated: T[]) => void
): ChunkReply {
	if (reply.kind !== 'saved') return reply;
	const added: T[] = [];
	const updated: T[] = [];
	const results = reply.data.results.map((result): RowCommitResult => {
		if (result.kind === 'failed') return { kind: 'failed', reason: result.message };
		if (result.kind === 'unchanged') return { kind: 'unchanged' };
		(result.kind === 'added' ? added : updated).push(result.record);
		return { kind: result.kind };
	});
	merge(added, updated);
	return { kind: 'saved', results };
}
