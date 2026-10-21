/**
 * Pure function: no side-effects, no store access, no Date.now() calls.
 * Pass `today` as a YYYY-MM-DD string so callers control the reference point
 * and tests can pin the date without real-time dependencies.
 *
 * Dashboard, personnel, and calendar surfaces should all consume this instead of
 * duplicating date-threshold arithmetic.
 */
import type { Personnel } from './personnel.types';

export type LossTriggerType = 'ETS' | 'PCS / DEROS';

export interface UpcomingLossRecord {
	/** Both fields intentionally carry the same value. */
	id: string;
	personId: string;
	/** Display name: "<rank> <lastName>" */
	personName: string;
	rank: string;
	lastName: string;
	triggerType: LossTriggerType;
	/** The relevant departure date (YYYY-MM-DD) */
	targetDate: string;
	/** Calendar days from today to targetDate (0 = today) */
	daysRemaining: number;
	awardDueSoon: boolean;
	awardTrackingAcknowledged: boolean;
	groupId: string | null;
}

/** Negative when `to` is in the past relative to `from`. */
function calendarDaysBetween(from: string, to: string): number {
	const fromMs = new Date(from + 'T00:00:00').getTime();
	const toMs = new Date(to + 'T00:00:00').getTime();
	return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

export function isInLossWindow(date: string | null | undefined, today: string, warningWindowDays: number): boolean {
	if (!date) return false;
	const days = calendarDaysBetween(today, date);
	return days >= 0 && days <= warningWindowDays;
}

/**
 * Rules:
 * - Only personnel with at least one non-null ETS or DEROS date are considered.
 * - A date is in-window when `0 <= daysRemaining <= warningWindowDays`.
 * - When both dates exist and both are in-window, only the nearer one is shown
 *   (avoids duplicating the same person with redundant entries).
 * - When only one of the two dates is in-window, that date wins regardless.
 * - Results are sorted ascending by daysRemaining (nearest departure first).
 */
export function evaluateUpcomingLosses(
	personnel: Personnel[],
	warningWindowDays: number,
	today: string,
	options?: {
		awardTrackingAcknowledgedPersonnelIds?: Iterable<string>;
	}
): UpcomingLossRecord[] {
	const results: UpcomingLossRecord[] = [];
	const acknowledgedPersonnelIds = new Set(options?.awardTrackingAcknowledgedPersonnelIds ?? []);

	for (const person of personnel) {
		const candidates: { triggerType: LossTriggerType; date: string; days: number }[] = [];

		if (person.ets) {
			const days = calendarDaysBetween(today, person.ets);
			if (days >= 0 && days <= warningWindowDays) {
				candidates.push({ triggerType: 'ETS', date: person.ets, days });
			}
		}

		if (person.deros) {
			const days = calendarDaysBetween(today, person.deros);
			if (days >= 0 && days <= warningWindowDays) {
				candidates.push({ triggerType: 'PCS / DEROS', date: person.deros, days });
			}
		}

		if (candidates.length === 0) continue;

		candidates.sort((a, b) => a.days - b.days);
		const nearest = candidates[0];
		const awardTrackingAcknowledged = acknowledgedPersonnelIds.has(person.id);

		results.push({
			id: person.id,
			personId: person.id,
			personName: `${person.rank} ${person.lastName}`,
			rank: person.rank,
			lastName: person.lastName,
			triggerType: nearest.triggerType,
			targetDate: nearest.date,
			daysRemaining: nearest.days,
			awardDueSoon: !awardTrackingAcknowledged,
			awardTrackingAcknowledged,
			groupId: person.groupId ?? null
		});
	}

	return results.sort((a, b) => a.daysRemaining - b.daysRemaining);
}
