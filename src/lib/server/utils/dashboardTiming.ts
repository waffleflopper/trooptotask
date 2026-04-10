export type DashboardLoadPhase = 'summary' | 'support';

function getNowMs(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export async function withDashboardTiming<T>(
	orgId: string,
	phase: DashboardLoadPhase,
	run: () => Promise<T>
): Promise<T> {
	const startedAt = getNowMs();

	try {
		const result = await run();
		console.info('[dashboard-load]', {
			orgId,
			phase,
			durationMs: Math.round(getNowMs() - startedAt),
			status: 'ok'
		});
		return result;
	} catch (error) {
		console.info('[dashboard-load]', {
			orgId,
			phase,
			durationMs: Math.round(getNowMs() - startedAt),
			status: 'error'
		});
		throw error;
	}
}
