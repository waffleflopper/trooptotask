import type { PlannerRoster, RosterFillPick } from '$features/calendar/contracts';
import type { RosterCode, RosterSwap, TrackId } from '$features/calendar/roster/rosterTypes';

export interface RosterEntry {
	readonly personId: string;
	readonly count: number;
	/** A, D or U that day, with its reason. Null when the person is available. */
	readonly effect: { readonly code: RosterCode; readonly reason: string } | null;
}

export interface RosterStanding {
	readonly track: TrackId;
	/** Highest count first, ties in DA 6 order. */
	readonly entries: readonly RosterEntry[];
}

export interface RosterConflict {
	readonly date: string;
	readonly personId: string;
	readonly code: RosterCode;
	readonly reason: string;
}

export interface RosterView {
	readonly typeId: string;
	/** One standing per track, or null before the form's first day. */
	readonly current: readonly RosterStanding[] | null;
	readonly todayAssignee: string | null;
	readonly excused: readonly string[];
	/** The month's detail days. On these days `conflicts` replaces the availability check. */
	readonly covered: ReadonlySet<string>;
	readonly conflicts: readonly RosterConflict[];
	/** Exchanges with either day in the shown month. */
	readonly swaps: readonly RosterSwap[];
}

/** Expands the server's indexed triples into one standing per track. */
export function decodePlannerRosters(rosters: readonly PlannerRoster[]): ReadonlyMap<string, RosterView> {
	return new Map(rosters.map((roster) => [roster.typeId, decodeRoster(roster)]));
}

function decodeRoster(roster: PlannerRoster): RosterView {
	const entries = (standing: readonly number[]) => {
		const decoded: RosterEntry[] = [];
		for (let at = 0; at < standing.length; at += 3) {
			const effect = standing[at + 2];
			decoded.push({
				personId: roster.people[standing[at]],
				count: standing[at + 1],
				effect: effect === 0 ? null : roster.effects[effect - 1]
			});
		}
		return decoded;
	};
	return {
		typeId: roster.typeId,
		current: roster.current?.map(({ track, standing }) => ({ track, entries: entries(standing) })) ?? null,
		todayAssignee: roster.todayAssignee,
		excused: roster.excused,
		covered: new Set(roster.covered),
		conflicts: roster.conflicts,
		swaps: roster.swaps
	};
}

/** One day of a swap: who held it when the swap was entered, and the other day it was traded for. */
export interface SwappedDay {
	readonly swap: RosterSwap;
	readonly heldBy: string;
	readonly otherDate: string;
	readonly otherHeldBy: string;
}

/** The swapped days of a roster by date. Either day of a swap may fall outside the month shown. */
export function indexSwappedDays(swaps: readonly RosterSwap[]): ReadonlyMap<string, SwappedDay> {
	return new Map(
		swaps.flatMap((swap) => {
			const [first, second] = swap.days;
			return [
				[first.date, { swap, heldBy: first.heldBy, otherDate: second.date, otherHeldBy: second.heldBy }],
				[second.date, { swap, heldBy: second.heldBy, otherDate: first.date, otherHeldBy: first.heldBy }]
			] as const;
		})
	);
}

/**
 * How many swaps writing `writes` ends. A write ends a swap when it moves either of its days to someone other than
 * the person holding the day now; saving the same person again keeps it.
 */
export function swapsEndedBy(
	swaps: readonly RosterSwap[],
	writes: readonly { date: string; assigneeId: string }[],
	holderOn: (date: string) => string | undefined
): number {
	const written = new Map(writes.map((write) => [write.date, write.assigneeId]));
	return swaps.filter((swap) => swap.days.some(({ date }) => written.has(date) && written.get(date) !== holderOn(date)))
		.length;
}

/** Reads as "Leave (A)": the reason, then the code. */
export function effectLabel(effect: { readonly code: RosterCode; readonly reason: string }): string {
	return `${effect.reason} (${effect.code})`;
}

/** Who a fill pick passed over, as in "Skipped SPC Cole (15). On Leave, count holds." */
export function rosterSkipNote(pick: Pick<RosterFillPick, 'passedOver'>, name: (personId: string) => string): string {
	return pick.passedOver
		.map((skip) => {
			const holds = skip.code === 'A' ? 'count holds' : 'count runs';
			return `Skipped ${name(skip.personId)} (${skip.count}). On ${skip.reason}, ${holds}.`;
		})
		.join(' ');
}
