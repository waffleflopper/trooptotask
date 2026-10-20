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

/** The `/api/cleanup-archived-records` cron fires at `0 5 * * *` in `vercel.json`. */
const CLEANUP_RUN_HOUR_UTC = 5;

/**
 * The first daily cleanup run that deletes a record archived at `archivedAt`: the first 05:00 UTC whose
 * `retentionCutoff` is not earlier than it.
 *
 * The cleanup deletes strictly before the cutoff and a run starts a little after 05:00, so a record archived
 * between 05:00:00 and the real start of that day's run is deleted on that run. The nominal 05:00 comparison
 * is inclusive to match every archive time but those few seconds, which it dates one day late.
 */
export function retentionDeletionDate(archivedAt: Date | string, retentionMonths: number): Date {
	const archived = new Date(archivedAt);
	if (Number.isNaN(archived.getTime())) throw new RangeError('archivedAt must be a valid date');
	if (!Number.isInteger(retentionMonths) || retentionMonths < 1) {
		throw new RangeError('retentionMonths must be a positive whole number');
	}
	// Any run in an earlier month has a cutoff before this month's start, so the search starts at the
	// first run of the month that is `retentionMonths` after the archive month.
	const run = new Date(
		Date.UTC(archived.getUTCFullYear(), archived.getUTCMonth() + retentionMonths, 1, CLEANUP_RUN_HOUR_UTC)
	);
	while (archived.getTime() > Date.parse(retentionCutoff(run, retentionMonths))) {
		run.setUTCDate(run.getUTCDate() + 1);
	}
	return run;
}
