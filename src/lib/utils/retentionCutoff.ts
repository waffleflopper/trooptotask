export function retentionCutoff(now: Date, retentionMonths: number): string {
	const targetMonthStart = new Date(
		Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth() - retentionMonths,
			1,
			now.getUTCHours(),
			now.getUTCMinutes(),
			now.getUTCSeconds(),
			now.getUTCMilliseconds()
		)
	);
	const lastTargetMonthDay = new Date(
		Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0)
	).getUTCDate();
	const cutoff = new Date(
		Date.UTC(
			targetMonthStart.getUTCFullYear(),
			targetMonthStart.getUTCMonth(),
			Math.min(now.getUTCDate(), lastTargetMonthDay),
			now.getUTCHours(),
			now.getUTCMinutes(),
			now.getUTCSeconds(),
			now.getUTCMilliseconds()
		)
	);
	return cutoff.toISOString();
}
