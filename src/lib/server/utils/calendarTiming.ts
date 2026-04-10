export type CalendarLoadPhase = 'workspace-bootstrap' | 'date-ranged-query' | 'duty-event-hydration';

function getNowMs(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export async function withCalendarTiming<T>(
	orgId: string,
	phase: CalendarLoadPhase,
	run: () => Promise<T>
): Promise<T> {
	const startedAt = getNowMs();

	try {
		const result = await run();
		console.info('[calendar-load]', {
			orgId,
			phase,
			durationMs: Math.round(getNowMs() - startedAt),
			status: 'ok'
		});
		return result;
	} catch (error) {
		console.info('[calendar-load]', {
			orgId,
			phase,
			durationMs: Math.round(getNowMs() - startedAt),
			status: 'error'
		});
		throw error;
	}
}
