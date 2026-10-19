import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { readLossWarningWindowDays } from '$features/organization/contracts';
import { calendarDayDiff, formatDate, parseDate } from '$lib/utils/dates';
import { authorizePersonnelLane } from './personnelDetail.server';
import type { PersonnelLossDate, PersonnelLossReadiness } from './personnelReadiness.types';
import type { Personnel } from './personnel.types';
import { evaluateUpcomingLosses } from './upcomingLoss';

function daysBefore(date: string, days: number): string {
	const result = parseDate(date);
	result.setDate(result.getDate() - days);
	return formatDate(result);
}

function lossDate(date: string | null | undefined, today: string): PersonnelLossDate | null {
	return date ? { date, daysRemaining: calendarDayDiff(parseDate(today), parseDate(date)) } : null;
}

/** ETS and DEROS against the Organization's loss window, under the same Personnel roster admission as the old lane. */
export async function loadPersonnelLossReadiness(
	ctx: Parameters<typeof authorizePersonnelLane>[0],
	person: Personnel,
	asOf: string,
	readWarningWindowDays: () => Promise<number | null | undefined>
): Promise<PersonnelLossReadiness> {
	await authorizePersonnelLane(ctx, person, POLICY_ACTION_CATALOG.personnel.viewRoster, 'personnel');
	const windowDays = await readLossWarningWindowDays(readWarningWindowDays());
	if (windowDays === null) throw new Error('Loss warning window unavailable');
	const [nearest] = evaluateUpcomingLosses([person], windowDays, asOf);
	return {
		windowDays,
		ets: lossDate(person.ets, asOf),
		deros: lossDate(person.deros, asOf),
		inWindow: nearest
			? {
					trigger: nearest.triggerType,
					date: nearest.targetDate,
					daysRemaining: nearest.daysRemaining,
					enteredOn: daysBefore(nearest.targetDate, windowDays)
				}
			: null
	};
}
