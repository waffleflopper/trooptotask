import { eventDateRange, eventDayRange, shortEventDateRange, type EventDates } from '../../../events/eventModel';
import type { GroupLabels } from '../../taskingModel';
import type { PickReview, StaffingAdvisory, StaffingPersonState } from '../staffingModel';

export function advisoryLabel(advisory: StaffingAdvisory): string {
	switch (advisory.kind) {
		case 'availability':
			return `${advisory.label} · ${eventDateRange(advisory)}`;
		case 'tasking':
			return `${advisory.title} · ${eventDateRange(advisory)}`;
		case 'committed_elsewhere':
			return 'Committed elsewhere';
	}
}

export function reviewLabel(review: PickReview, groupId: string | null, groups: GroupLabels): string {
	switch (review) {
		case 'archived':
			return 'Archived';
		case 'left_group':
			return groupId === null ? 'No longer in a Group' : `Moved to ${groups[groupId] ?? 'another Group'}`;
		case 'eligible_again':
			return 'Eligible again';
	}
}

export const groupLabel = (groupId: string | null, groups: GroupLabels) =>
	groupId === null ? 'Unassigned' : (groups[groupId] ?? 'Another group');

export function availabilityGapLabel(uncovered: number, total: number): string {
	if (uncovered === 0) return 'Availability covers every execution day for everyone picked.';
	return `${uncovered} of ${total} picked ${total === 1 ? 'person has' : 'people have'} no Availability covering every execution day.`;
}

/** What a Person's other commitments say about these dates. Unknown claims nothing, so it has no line. */
export type PersonStateLine = { tone: 'clear' | 'conflict' | 'elsewhere'; text: string } | null;

const more = (count: number, noun: string) => (count > 0 ? ` And ${count} more ${noun}${count === 1 ? '' : 's'}.` : '');

export function personStateLine(
	state: StaffingPersonState,
	execution: EventDates | null,
	today: string
): PersonStateLine {
	switch (state.kind) {
		case 'unknown':
			return null;
		case 'clear':
			return { tone: 'clear', text: 'No known overlap' };
		case 'conflict': {
			const [first, ...rest] = state.availability;
			return {
				tone: 'conflict',
				text: `${first.label} ${eventDayRange(first, today)}. Overlaps ${first.overlapDays} of ${first.executionDays} days.${more(rest.length, 'overlap')}`
			};
		}
		case 'committed_elsewhere': {
			const [first, ...rest] = state.commitments;
			if (first.kind === 'committed_elsewhere')
				return { tone: 'elsewhere', text: `Committed elsewhere over these dates.${more(rest.length, 'commitment')}` };
			const same = execution && first.startsOn === execution.startsOn && first.endsOn === execution.endsOn;
			return {
				tone: 'elsewhere',
				text: `Already on ${first.title}, ${same ? 'same dates' : eventDayRange(first, today)}.${more(rest.length, 'commitment')}`
			};
		}
	}
}

const nameList = (names: string[]) =>
	names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** The toast after a picker save: the new count, then what changed for the people and that nobody was told. */
export function savedSelectionToast(
	picked: number,
	required: number | null,
	joined: string[],
	left: string[],
	execution: EventDates | null,
	today: string
): { title: string; description: string } {
	const title = required === null ? `${picked} selected` : `${picked} of ${required} selected`;
	const sentences: string[] = [];
	if (execution && joined.length > 0)
		sentences.push(
			`${nameList(joined)} now ${joined.length === 1 ? 'shows' : 'show'} a commitment on the calendar for ${shortEventDateRange(execution, today)}.`
		);
	if (execution && left.length > 0)
		sentences.push(`${nameList(left)} no longer ${left.length === 1 ? 'shows' : 'show'} this commitment.`);
	sentences.push('No one was notified.');
	return { title, description: sentences.join(' ') };
}

/** The MOS codes the qualifications text names that someone on the roster holds, upper-cased. */
export function qualificationTokens(qualifications: string | null, held: string[]): string[] {
	if (!qualifications) return [];
	const roster = new Set(held.map((mos) => mos.trim().toUpperCase()).filter(Boolean));
	const named = qualifications.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
	return [...new Set(named.filter((token) => roster.has(token)))];
}
