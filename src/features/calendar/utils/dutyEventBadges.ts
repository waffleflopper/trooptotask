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
 * Indexes duty event slot assignments as lightweight render-ready badges, keyed by
 * personnel id and then by event date string. Unfilled slots are skipped.
 */
export function buildDutyEventBadgesByPerson(events: DutyEvent[]): Map<string, Map<string, DutyEventBadge[]>> {
	const byPerson = new Map<string, Map<string, DutyEventBadge[]>>();
	for (const event of events) {
		const shortName = deriveShortName(event.templateName);
		const { color, textColor } = deriveBadgeColor(event.templateId);
		for (const slot of event.slotInstances) {
			if (!slot.assigneeId) continue;
			let dateMap = byPerson.get(slot.assigneeId);
			if (!dateMap) {
				dateMap = new Map<string, DutyEventBadge[]>();
				byPerson.set(slot.assigneeId, dateMap);
			}
			let list = dateMap.get(event.eventDate);
			if (!list) {
				list = [];
				dateMap.set(event.eventDate, list);
			}
			list.push({
				shortName,
				color,
				textColor,
				title: `${event.templateName} — ${slot.roleLabel}`,
				eventId: event.id,
				slotId: slot.id
			});
		}
	}
	return byPerson;
}
