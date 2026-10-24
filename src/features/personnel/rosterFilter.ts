import {
	chipAvailable,
	ROSTER_CHIPS,
	type RosterChip,
	type RosterFilter,
	type RosterStatusType,
	type SignalAccess
} from './rosterSignals';

/** The roster URL parameter that carries the active filter, so a filtered roster can be shared and survives reload. */
export const ROSTER_FILTER_PARAM = 'show';

const STATUS_PREFIX = 'status:';

/** The filter a `?show=` value names, or null for a missing, empty or unknown value. */
export function parseRosterFilter(value: string | null): RosterFilter | null {
	if (!value) return null;
	if (value === 'present') return { kind: 'present' };
	if (value.startsWith(STATUS_PREFIX)) {
		const statusTypeId = value.slice(STATUS_PREFIX.length);
		return statusTypeId ? { kind: 'status', statusTypeId } : null;
	}
	const chip = ROSTER_CHIPS.find((candidate) => candidate === value);
	return chip ? { kind: 'chip', chip } : null;
}

export function serializeRosterFilter(filter: RosterFilter): string {
	switch (filter.kind) {
		case 'chip':
			return filter.chip;
		case 'present':
			return 'present';
		case 'status':
			return `${STATUS_PREFIX}${filter.statusTypeId}`;
	}
}

export function sameRosterFilter(a: RosterFilter | null, b: RosterFilter | null): boolean {
	if (a === null || b === null) return a === b;
	return serializeRosterFilter(a) === serializeRosterFilter(b);
}

/** The chip a filter lights, or null when a headcount entry carries it. */
export function chipOf(filter: RosterFilter | null): RosterChip | null {
	return filter?.kind === 'chip' ? filter.chip : null;
}

/**
 * Whether the settled lane can answer a filter: its source is read for the viewer and, for a status, the Organization
 * still has that type. A filter the lane cannot answer shows the roster unfiltered rather than an empty one.
 */
export function rosterFilterAnswerable(
	filter: RosterFilter,
	lane: { access: SignalAccess; lossesEnabled: boolean; statusTypes: readonly RosterStatusType[] }
): boolean {
	switch (filter.kind) {
		case 'chip':
			return chipAvailable(filter.chip, lane.access, lane.lossesEnabled);
		case 'present':
			return lane.access.availability;
		case 'status':
			return lane.access.availability && lane.statusTypes.some((type) => type.id === filter.statusTypeId);
	}
}
