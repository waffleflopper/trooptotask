import type { RosterCode, RosterEffect } from '$features/calendar/roster/rosterTypes';
import type { StatusEffectChange } from '$features/calendar/contracts';

interface RosterEffectOption {
	readonly value: RosterEffect;
	/** The DA PAM 220-45 code, or null when the status does not touch a roster. */
	readonly code: RosterCode | null;
	readonly title: string;
	/** The short text each status row shows. */
	readonly rowText: string;
	readonly summary: string;
	readonly examples: string;
}

export const ROSTER_EFFECT_OPTIONS: readonly RosterEffectOption[] = [
	{
		value: 'available',
		code: null,
		title: 'Still available',
		rowText: 'Still available',
		summary: 'Can still be picked.',
		examples: 'Appointments and short absences.'
	},
	{
		value: 'A',
		code: 'A',
		title: 'Away',
		rowText: 'Away, count holds',
		summary: 'Count holds while away.',
		examples: 'Leave, pass, TDY, school, sick in line of duty.'
	},
	{
		value: 'D',
		code: 'D',
		title: 'Other duty',
		rowText: 'Other duty, count runs',
		summary: 'Count keeps running.',
		examples: 'Busy with another detail or duty.'
	},
	{
		value: 'U',
		code: 'U',
		title: 'Misconduct',
		rowText: 'Misconduct, count runs',
		summary: 'Count keeps running.',
		examples: 'AWOL, arrest, confinement.'
	}
];

export function rosterEffectOption(effect: RosterEffect): RosterEffectOption {
	return ROSTER_EFFECT_OPTIONS.find((option) => option.value === effect)!;
}

const TRACK_SUFFIX = { all: '', weekday: ' (weekdays)', weekend: ' (weekends and holidays)' } as const;

/** One confirmation line, such as "SGT Kim 11 → 9 on the CQ DA 6". */
export function statusEffectChangeText({ person, rosterName, track, change }: StatusEffectChange): string {
	const form = `on the ${rosterName} DA 6${TRACK_SUFFIX[track]}`;
	return change.kind === 'number'
		? `${person} ${change.from} → ${change.to} ${form}`
		: `${person}: ${change.days} earlier ${change.days === 1 ? 'day changes' : 'days change'} ${form}`;
}
