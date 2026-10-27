import type { StaffingPersonState, StaffingPicker } from '$features/calendar';
import { resolveBuiltInRank } from '$features/personnel/contracts';
import { formatWeekdayDay } from '$lib/utils/dates';
import { toDayNumber } from '$lib/utils/dayNumber';

/** The row draws at most this many slots; a bigger requirement links to the full picker for the rest. */
export const DRAWN_SLOTS = 4;

/** A Conflict row's person, whose slot opens for a replacement. */
export interface PickSwap {
	personnelId: string;
	personLabel: string;
	statusLabel: string;
	startsOn: string;
}

export interface PickRole {
	singular: string;
	plural: string;
}

export interface PickSlot {
	/** Stable across reloads of the same picks, so a draft choice survives a save conflict. */
	key: string;
	label: string;
	/** Who holds the slot in what is saved; null for an open slot. */
	saved: string | null;
	/** The swapped person's slot, marked until it holds someone else. */
	swap: boolean;
	/** Who the slot holds in the draft: the viewer's choice, else a suggestion, else the saved pick. */
	personnelId: string | null;
}

export interface PickPlan {
	slots: PickSlot[];
	/** Open slots past `DRAWN_SLOTS`, left for the full picker. */
	hidden: number;
	/** Every person the save names: the stored picks with each slot's change applied. */
	selection: string[];
	/** Slots that now hold someone they did not hold before. */
	changed: number;
}

export interface PickPerson {
	personnelId: string;
	rank: string;
	firstName: string;
	lastName: string;
	groupId: string | null;
}

/**
 * The word for one picked person, read from a title that states the requirement, such as "Provide 3 lane graders":
 * the first plural within three words after the count.
 */
export function pickRole(title: string, required: number | null): PickRole | null {
	if (required === null) return null;
	const words = title.split(/\s+/);
	const at = words.indexOf(String(required));
	if (at < 0) return null;
	const plural = words.slice(at + 1, at + 4).find((word) => /^[A-Za-z][A-Za-z-]+s$/.test(word));
	return plural ? { singular: plural.slice(0, -1), plural } : null;
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export const fullName = (person: PickPerson) => `${person.rank} ${person.lastName}, ${person.firstName}`.trim();
export const shortName = (person: PickPerson) => `${person.rank} ${person.lastName}`.trim();

const byName = (a: PickPerson, b: PickPerson) =>
	a.lastName.localeCompare(b.lastName) ||
	a.firstName.localeCompare(b.firstName) ||
	a.personnelId.localeCompare(b.personnelId);

/** Everyone a slot may name: the roster candidates and the people already picked. */
export function pickPeople(picker: StaffingPicker): Map<string, PickPerson> {
	const people = new Map<string, PickPerson>();
	for (const person of [...picker.staffing.picks, ...picker.candidates])
		if (!people.has(person.personnelId)) people.set(person.personnelId, person);
	return people;
}

const isClear = (picker: StaffingPicker, personnelId: string) => picker.states[personnelId]?.kind === 'clear';

/** A grade floor the requirement states, as in "E-6 or above" or a title's "(E-6+)". */
export function gradeFloor(picker: StaffingPicker, title: string): string | null {
	for (const text of [picker.tasking.requirement?.qualifications ?? '', title]) {
		const match = /\b([EWO])-?(\d{1,2})\s*(?:\+|or above|and above)/i.exec(text);
		if (match) return `${match[1].toUpperCase()}-${match[2]}`;
	}
	return null;
}

const GRADE_TIERS: Record<string, number> = { E: 0, W: 1, O: 2 };

function meetsFloor(rank: string, floor: string | null): boolean {
	if (!floor) return true;
	const grade = resolveBuiltInRank(rank)?.payGrade;
	if (!grade || grade === 'ungraded') return false;
	const [tier, step] = grade.split('-');
	const [floorTier, floorStep] = floor.split('-');
	return (GRADE_TIERS[tier] - GRADE_TIERS[floorTier] || Number(step) - Number(floorStep)) >= 0;
}

/**
 * Lays the requirement out as slots: picks that count, then the swapped person's slot, then one per person still
 * needed. Open slots take the viewer's choice, else the next person free over the dates who meets any stated grade
 * floor, in name order.
 */
export function planPickSlots(
	picker: StaffingPicker,
	title: string,
	swap: PickSwap | null,
	choices: ReadonlyMap<string, string>
): PickPlan {
	const required = picker.tasking.requirement?.count ?? null;
	const role = pickRole(title, required);
	const counted = picker.staffing.picks.filter((pick) => pick.reviewSince === null && !pick.archived);
	const swapped = swap && counted.some((pick) => pick.personnelId === swap.personnelId) ? swap.personnelId : null;
	const open = required === null ? 0 : Math.max(required - picker.staffing.picked, 0);
	const label = (position: number) => `${role ? capitalize(role.singular) : 'Person'} ${position}`;

	type Draft = Omit<PickSlot, 'personnelId'> & { open: boolean };
	const kept: Draft[] = counted
		.filter((pick) => pick.personnelId !== swapped)
		.map((pick) => ({
			key: `pick:${pick.personnelId}`,
			label: 'Selected',
			saved: pick.personnelId,
			swap: false,
			open: false
		}));
	const opened: Draft[] = [
		...(swapped
			? [{ key: `swap:${swapped}`, label: label(kept.length + 1), saved: swapped, swap: true, open: true }]
			: []),
		...Array.from({ length: open }, (_, index) => ({
			key: `open:${index}`,
			label: label(kept.length + (swapped ? 2 : 1) + index),
			saved: null,
			swap: false,
			open: true
		}))
	];
	const drawnOpen = opened.slice(0, DRAWN_SLOTS);
	const drafts = [...kept.slice(Math.max(kept.length + drawnOpen.length - DRAWN_SLOTS, 0)), ...drawnOpen];

	const taken = new Set([...picker.staffing.picks.map((pick) => pick.personnelId), ...choices.values()]);
	const suggestions = [...pickPeople(picker).values()]
		.filter(
			(person) =>
				!taken.has(person.personnelId) &&
				isClear(picker, person.personnelId) &&
				meetsFloor(person.rank, gradeFloor(picker, title))
		)
		.sort(byName);
	const slots = drafts.map(({ open: needsSomeone, ...slot }): PickSlot => {
		const choice = choices.get(slot.key);
		if (choice !== undefined) return { ...slot, personnelId: choice };
		if (!needsSomeone) return { ...slot, personnelId: slot.saved };
		return { ...slot, personnelId: suggestions.shift()?.personnelId ?? null };
	});

	const changes = slots.filter((slot) => slot.personnelId !== null && slot.personnelId !== slot.saved);
	const replaced = new Set(changes.flatMap((slot) => (slot.saved ? [slot.saved] : [])));
	const selection = [
		...new Set([
			...picker.staffing.picks.map((pick) => pick.personnelId).filter((id) => !replaced.has(id)),
			...changes.map((slot) => slot.personnelId!)
		])
	];
	return { slots, hidden: opened.length - drawnOpen.length, selection, changed: changes.length };
}

/** Who a slot may switch to: anyone the save would not already name, most available first. */
export function slotOptions(picker: StaffingPicker, plan: PickPlan, slot: PickSlot): PickPerson[] {
	const named = new Set(plan.selection);
	named.delete(slot.personnelId ?? '');
	if (slot.saved) named.delete(slot.saved);
	const order = (personnelId: string) => STATE_ORDER[picker.states[personnelId]?.kind ?? 'unknown'];
	return [...pickPeople(picker).values()]
		.filter((person) => !named.has(person.personnelId))
		.sort((a, b) => order(a.personnelId) - order(b.personnelId) || byName(a, b));
}

const STATE_ORDER: Record<StaffingPersonState['kind'], number> = {
	clear: 0,
	committed_elsewhere: 1,
	unknown: 2,
	conflict: 3
};

export function confirmLabel(title: string, required: number | null, changed: number): string {
	if (changed === 0) return 'Confirm';
	const role = pickRole(title, required);
	const noun = role ? (changed === 1 ? role.singular : role.plural) : changed === 1 ? 'person' : 'people';
	return `Confirm ${changed} ${noun}`;
}

function executionDays(picker: StaffingPicker): number {
	const execution = picker.tasking.execution;
	return execution ? toDayNumber(execution.endsOn) - toDayNumber(execution.startsOn) + 1 : 0;
}

function daysPhrase(count: number, of: number): string {
	if (of === 1) return 'that day';
	return count === of ? `all ${of} days` : `${count} of ${of} days`;
}

/** How a person stands over the execution dates, in the slot's note line. A conflict reads in amber. */
export function availabilityNote(picker: StaffingPicker, personnelId: string): { text: string; warning: boolean } {
	const state = picker.states[personnelId];
	switch (state?.kind) {
		case 'clear':
			return { text: `free ${daysPhrase(executionDays(picker), executionDays(picker))}`, warning: false };
		case 'conflict': {
			const [first] = state.availability;
			return { text: `${first.label} ${daysPhrase(first.overlapDays, first.executionDays)}`, warning: true };
		}
		case 'committed_elsewhere': {
			const [first] = state.commitments;
			return { text: first.kind === 'tasking' ? `also on ${first.title}` : 'committed elsewhere', warning: false };
		}
		default:
			return { text: 'availability unknown', warning: false };
	}
}

const gradeOf = (person: PickPerson) => {
	const grade = resolveBuiltInRank(person.rank)?.payGrade;
	return grade && grade !== 'ungraded' ? grade : null;
};

const groupOf = (person: PickPerson, groups: Readonly<Record<string, string>>) =>
	person.groupId ? (groups[person.groupId] ?? null) : null;

/** Grade, Group and availability, the facts a picker weighs. */
export function personNote(
	picker: StaffingPicker,
	person: PickPerson,
	groups: Readonly<Record<string, string>>
): { text: string; warning: boolean } {
	const availability = availabilityNote(picker, person.personnelId);
	const facts = [gradeOf(person), groupOf(person, groups), availability.text];
	return { text: facts.filter(Boolean).join(' · '), warning: availability.warning };
}

/** A slot names a pick it keeps by Group and anyone else by availability; a conflict always shows. */
export function slotNote(
	picker: StaffingPicker,
	person: PickPerson,
	groups: Readonly<Record<string, string>>,
	kept: boolean
): { text: string; warning: boolean } {
	const availability = availabilityNote(picker, person.personnelId);
	const place = kept && !availability.warning ? groupOf(person, groups) : availability.text;
	return { text: [gradeOf(person), place].filter(Boolean).join(' · '), warning: availability.warning };
}

export function suggestionLine(picker: StaffingPicker, title: string): string {
	const { execution, requirement } = picker.tasking;
	if (!execution || picker.advisories.kind === 'no_execution')
		return 'This Tasking has no execution dates, so nobody is suggested.';
	if (picker.advisories.kind === 'failed') return 'Conflicts could not be checked, so nobody is suggested.';
	const dates =
		execution.startsOn === execution.endsOn
			? formatWeekdayDay(execution.startsOn)
			: `${formatWeekdayDay(execution.startsOn)} – ${formatWeekdayDay(execution.endsOn)}`;
	const floor = gradeFloor(picker, title);
	if (floor) return `Suggested: ${floor} and above, available ${dates} and not already committed elsewhere.`;
	const asks = requirement?.qualifications ? ` Asks for ${requirement.qualifications.replace(/\.$/, '')}.` : '';
	return `Suggested: available ${dates} and not already committed elsewhere, in name order.${asks}`;
}
