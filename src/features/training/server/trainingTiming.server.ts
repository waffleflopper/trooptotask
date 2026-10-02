export type TrainingLoadPhase =
	| 'personnel'
	| 'groups'
	| 'training-types'
	| 'training-views'
	| 'pinned-groups'
	| 'personnel-trainings'
	| 'rank-catalog';

function getNowMs(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export async function withTrainingTiming<T>(
	orgId: string,
	phase: TrainingLoadPhase,
	run: () => Promise<T>
): Promise<T> {
	const startedAt = getNowMs();

	try {
		const result = await run();
		console.info('[training-load]', {
			orgId,
			phase,
			durationMs: Math.round(getNowMs() - startedAt),
			status: 'ok'
		});
		return result;
	} catch (error) {
		console.error('[training-load]', {
			orgId,
			phase,
			durationMs: Math.round(getNowMs() - startedAt),
			status: 'error'
		});
		throw error;
	}
}
