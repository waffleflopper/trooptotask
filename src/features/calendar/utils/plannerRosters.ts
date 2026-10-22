import type { PlannerRoster } from '$features/calendar/contracts';
import type { RosterCode, TrackId } from '$features/calendar/roster/rosterTypes';

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
		conflicts: roster.conflicts
	};
}

/** Reads as "Leave (A)": the reason, then the code. */
export function effectLabel(effect: { readonly code: RosterCode; readonly reason: string }): string {
	return `${effect.reason} (${effect.code})`;
}
