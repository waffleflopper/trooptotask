/**
 * Builds date-keyed, person-keyed indices of advanced-duty-event badges so the calendar
 * can render one tiny assignment-style badge per slot assignment without adding new rows
 * or columns to the calendar grid. Mirrors the simple daily-assignment badge pattern.
 */
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';

export interface DutyEventBadge {
	/** Abbreviation shown on the badge (2-3 chars). */
	shortName: string;
	/** Deterministic color derived from the template id so the same template renders the same hue. */
	color: string;
	/** Text color for legibility against `color`. */
	textColor: string;
	/** Full-text tooltip shown on hover: "Template Name — Role". */
	title: string;
	/** Owning duty event id, for future drill-down. */
	eventId: string;
	/** Owning slot instance id. */
	slotId: string;
}

/**
 * Stable djb2-style hash over a string. Used to pick a hue so the same
 * template always renders with the same color between sessions.
 */
function hashString(input: string): number {
	let hash = 5381;
	for (let i = 0; i < input.length; i += 1) {
		hash = (hash * 33) ^ input.charCodeAt(i);
	}
	return hash >>> 0;
}

/**
 * Produces a readable short label from a template name: initials if multi-word,
 * otherwise the first 3 characters uppercased.
 */
export function deriveShortName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return 'DTY';
	const words = trimmed.split(/\s+/).filter(Boolean);
	if (words.length > 1) {
		return words
			.slice(0, 3)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('');
	}
	return trimmed.slice(0, 3).toUpperCase();
}

/** Produces a stable, accessible HSL color from a template id. */
export function deriveBadgeColor(templateId: string): { color: string; textColor: string } {
	const hue = hashString(templateId) % 360;
	// Fixed S/L so duty badges visually feel like a family distinct from assignment-type badges.
	// Slightly darker than typical assignment-type pills to read well with white text.
	return {
		color: `hsl(${hue} 55% 38%)`,
		textColor: '#ffffff'
	};
}

/**
 * Returns every calendar date string covered by the given coverage window.
 * A day is covered if the window has any non-zero presence on it — midnight
 * endings (e.g. 00:00:00) are treated as ending at the start of that day,
 * so the end date is excluded in that case.
 */
function getCoveredDates(coverageStart: string, coverageEnd: string): string[] {
	const startDate = coverageStart.slice(0, 10);
	const endDateRaw = coverageEnd.slice(0, 10);
	const endTime = coverageEnd.slice(11, 19);
	const endDate = endTime === '00:00:00' ? null : endDateRaw;

	if (!endDate || startDate === endDate) return [startDate];

	const dates: string[] = [];
	const cursor = new Date(startDate + 'T00:00:00Z');
	const last = new Date(endDate + 'T00:00:00Z');
	while (cursor <= last) {
		dates.push(cursor.toISOString().slice(0, 10));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return dates;
}

/**
 * Indexes duty event slot assignments as lightweight render-ready badges, keyed by
 * personnel id and then by date string. Overnight events produce badges on every
 * calendar day their coverage window touches unless `startDayOnly` is true, in which
 * case the badge only appears on the event's start date. Unfilled slots are skipped.
 */
export function buildDutyEventBadgesByPerson(
	events: DutyEvent[],
	options: { startDayOnly?: boolean } = {}
): Map<string, Map<string, DutyEventBadge[]>> {
	const { startDayOnly = false } = options;
	const byPerson = new Map<string, Map<string, DutyEventBadge[]>>();
	for (const event of events) {
		const shortName = deriveShortName(event.templateName);
		const { color, textColor } = deriveBadgeColor(event.templateId);
		const coveredDates = startDayOnly ? [event.eventDate] : getCoveredDates(event.coverageStart, event.coverageEnd);
		for (const slot of event.slotInstances) {
			if (!slot.assigneeId) continue;
			let dateMap = byPerson.get(slot.assigneeId);
			if (!dateMap) {
				dateMap = new Map<string, DutyEventBadge[]>();
				byPerson.set(slot.assigneeId, dateMap);
			}
			const badge: DutyEventBadge = {
				shortName,
				color,
				textColor,
				title: `${event.templateName} — ${slot.roleLabel}`,
				eventId: event.id,
				slotId: slot.id
			};
			for (const date of coveredDates) {
				let list = dateMap.get(date);
				if (!list) {
					list = [];
					dateMap.set(date, list);
				}
				list.push(badge);
			}
		}
	}
	return byPerson;
}
