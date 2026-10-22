import { FEATURE_SWITCHES, type FeatureKey } from '$lib/access/featureSwitches';
import { highestFlaggedAvailable } from './strengthFloor';
import type { UnitCounts } from './unitCounts';

export const FEATURE_COUNT_KEYS = [
	'activePersonnel',
	'statusTypes',
	'trainingTypes',
	'trainingRecords',
	'criticalTaskLists',
	'ratingSchemeEntries',
	'onboardingTemplates'
] as const;

export type FeatureCounts = UnitCounts<(typeof FEATURE_COUNT_KEYS)[number]>;

/** The switches and the floor come from the organization row on first paint; the counts stream. */
export interface FeaturesSettingsData {
	disabledFeatures: FeatureKey[];
	strengthFloorPercent: number;
	lossWarningWindowDays: number;
	counts: Promise<FeatureCounts>;
}

/** What a row holds; `missing` names what the feature lacks when it holds nothing. */
export type FeatureHolds = { text: string; missing: string | null };

export interface FeatureRow {
	key: FeatureKey;
	label: string;
	description: string;
	offDescription: string;
	/** Null for Losses and awards, whose lane is the warning window from the organization row. */
	holds: ((counts: FeatureCounts) => FeatureHolds) | null;
}

function count(n: number, one: string, many = `${one}s`): string {
	return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function holding(text: string, empty: boolean, missing: string): FeatureHolds {
	return { text, missing: empty ? missing : null };
}

const OFF = 'Off. Hidden from the sidebar and the dashboard';

export const FEATURE_ROWS: readonly FeatureRow[] = (
	[
		{
			key: 'training',
			description: 'Training records, types and reports, and training currency on the dashboard.',
			offDescription: `${OFF}, and its summary isn't loaded. Training types and records are kept.`,
			holds: (c) =>
				holding(
					`${count(c.trainingTypes, 'type')} · ${count(c.trainingRecords, 'record')}`,
					c.trainingTypes === 0,
					'training types'
				)
		},
		{
			key: 'criticalTasks',
			description: 'Critical task lists and sign-offs, and the critical tasks summary on the dashboard.',
			offDescription: `${OFF}, and its summary isn't loaded. Task lists and sign-offs are kept.`,
			holds: (c) => holding(count(c.criticalTaskLists, 'task list'), c.criticalTaskLists === 0, 'task lists')
		},
		{
			key: 'evaluations',
			description: 'The rating scheme and Evals, and overdue and due-soon NCOERs and OERs on the dashboard.',
			offDescription: `${OFF}, and its due dates aren't loaded. The rating scheme is kept.`,
			holds: (c) =>
				holding(
					`${c.ratingSchemeEntries.toLocaleString('en-US')} in rating scheme`,
					c.ratingSchemeEntries === 0,
					'rating scheme'
				)
		},
		{
			key: 'onboarding',
			description: 'Onboarding packets and templates, and onboarding progress on the dashboard.',
			offDescription: `${OFF}, and its progress isn't loaded. Templates and packets are kept.`,
			holds: (c) => holding(count(c.onboardingTemplates, 'template'), c.onboardingTemplates === 0, 'templates')
		},
		{
			key: 'lossesAndAwards',
			description:
				'ETS and DEROS dates inside the warning window, and end-of-tour awards, on the dashboard and calendar.',
			offDescription:
				'Off. Loss warnings and awards are hidden from the dashboard, the calendar and Personnel. Dates are kept.',
			holds: null
		}
	] satisfies Omit<FeatureRow, 'label'>[]
).map((row) => ({ ...row, label: FEATURE_SWITCHES[row.key].label }));

export function availabilityHolds(counts: FeatureCounts): string {
	return `${count(counts.activePersonnel, 'person', 'people')} · ${count(counts.statusTypes, 'status', 'statuses')}`;
}

export function lossWindowHolds(days: number): string {
	return `Window ${count(days, 'day')}`;
}

export type HoldsLane = { text: string; notSetUp: boolean };

/** An off feature's records are closed to every role, so its row cannot count them. */
export function holdsLane(holds: FeatureHolds, on: boolean): HoldsLane {
	if (!on) return { text: 'Not counted while off', notSetUp: false };
	if (holds.missing === null) return { text: holds.text, notSetUp: false };
	return { text: `Not set up · no ${holds.missing}`, notSetUp: true };
}

/** States the unit-wide cutoff the dashboard applies, using the dashboard's own rounding. */
export function strengthFloorSentence(floorPercent: number, activePersonnel: number): string {
	const flagged = highestFlaggedAvailable(activePersonnel, floorPercent);
	if (flagged === null) return 'No one is on the roster yet, so nothing is flagged.';
	const exact = ((floorPercent * activePersonnel) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
	const lead = `${floorPercent}% of ${activePersonnel.toLocaleString('en-US')} is ${exact}`;
	if (flagged === 0) return `${lead}, so the unit is flagged only when no one is available.`;
	return `${lead}, so ${flagged.toLocaleString('en-US')} or fewer available is flagged.`;
}
