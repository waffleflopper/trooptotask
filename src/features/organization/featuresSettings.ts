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
	'onboardingTemplates',
	'calendarEvents'
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

type SetupCountKey = 'trainingTypes' | 'criticalTaskLists' | 'ratingSchemeEntries' | 'onboardingTemplates';

interface FeatureSetup {
	count: SetupCountKey;
	missing: string;
	/** Where to fix it; `path` is under `/org/<segment>/`. */
	fix: { label: string; path: string };
}

export const FEATURE_SETUP = {
	training: {
		count: 'trainingTypes',
		missing: 'training types',
		fix: { label: 'Add a training type', path: 'training/types' }
	},
	criticalTasks: {
		count: 'criticalTaskLists',
		missing: 'task lists',
		fix: { label: 'Add a task', path: 'critical-tasks/library' }
	},
	evaluations: {
		count: 'ratingSchemeEntries',
		missing: 'rating scheme',
		fix: { label: 'Add an entry', path: 'evals' }
	},
	onboarding: {
		count: 'onboardingTemplates',
		missing: 'templates',
		fix: { label: 'Create a template', path: 'onboarding/templates' }
	}
} as const satisfies Partial<Record<FeatureKey, FeatureSetup>>;

export type SetupFeatureKey = keyof typeof FEATURE_SETUP;

function holding(key: SetupFeatureKey, counts: FeatureCounts, text: string): FeatureHolds {
	const { count: countKey, missing } = FEATURE_SETUP[key];
	return { text, missing: counts[countKey] === 0 ? missing : null };
}

const OFF = 'Off. Hidden from the sidebar and the dashboard';

export const FEATURE_ROWS: readonly FeatureRow[] = (
	[
		{
			key: 'training',
			description: 'Training records, types and reports, and training currency on the dashboard.',
			offDescription: `${OFF}, and its summary isn't loaded. Training types and records are kept.`,
			holds: (c) => holding('training', c, `${count(c.trainingTypes, 'type')} · ${count(c.trainingRecords, 'record')}`)
		},
		{
			key: 'criticalTasks',
			description: 'Critical task lists and sign-offs, and the critical tasks summary on the dashboard.',
			offDescription: `${OFF}, and its summary isn't loaded. Task lists and sign-offs are kept.`,
			holds: (c) => holding('criticalTasks', c, count(c.criticalTaskLists, 'task list'))
		},
		{
			key: 'evaluations',
			description: 'The rating scheme and Evals, and overdue and due-soon NCOERs and OERs on the dashboard.',
			offDescription: `${OFF}, and its due dates aren't loaded. The rating scheme is kept.`,
			holds: (c) => holding('evaluations', c, `${c.ratingSchemeEntries.toLocaleString('en-US')} in rating scheme`)
		},
		{
			key: 'onboarding',
			description: 'Onboarding packets and templates, and onboarding progress on the dashboard.',
			offDescription: `${OFF}, and its progress isn't loaded. Templates and packets are kept.`,
			holds: (c) => holding('onboarding', c, count(c.onboardingTemplates, 'template'))
		},
		{
			key: 'lossesAndAwards',
			description:
				'ETS and DEROS dates inside the warning window, and end-of-tour awards, on the dashboard and calendar.',
			offDescription:
				'Off. Loss warnings and awards are hidden from the dashboard, the calendar and Personnel. Dates are kept.',
			holds: null
		},
		{
			key: 'eventsAndTaskings',
			description: 'Events your unit runs or supports, with their dates, host and coordinator, from the calendar.',
			offDescription: 'Off. Events are hidden from the calendar. They are kept.',
			holds: (c) => ({ text: count(c.calendarEvents, 'event'), missing: null })
		}
	] satisfies Omit<FeatureRow, 'label'>[]
).map((row) => ({ ...row, label: FEATURE_SWITCHES[row.key].label }));

const isSetupFeature = (key: FeatureKey): key is SetupFeatureKey => key in FEATURE_SETUP;

export function setupFeaturesOn(disabledFeatures: readonly FeatureKey[]): SetupFeatureKey[] {
	return FEATURE_ROWS.map((row) => row.key).filter(
		(key): key is SetupFeatureKey => isSetupFeature(key) && !disabledFeatures.includes(key)
	);
}

export function featuresNotSetUp(
	disabledFeatures: readonly FeatureKey[],
	counts: Partial<Record<SetupCountKey, number>>
): SetupFeatureKey[] {
	return setupFeaturesOn(disabledFeatures).filter((key) => counts[FEATURE_SETUP[key].count] === 0);
}

export function availabilityHolds(counts: FeatureCounts): string {
	return `${count(counts.activePersonnel, 'person', 'people')} · ${count(counts.statusTypes, 'status', 'statuses')}`;
}

export function lossWindowHolds(days: number): string {
	return `Window ${count(days, 'day')}`;
}

export type HoldsLane = { text: string; notSetUp: boolean };

/** "Not set up" applies only to a feature that is on; an off feature just says what it lacks. */
export function holdsLane(holds: FeatureHolds, on: boolean): HoldsLane {
	if (holds.missing === null) return { text: holds.text, notSetUp: false };
	if (on) return { text: `Not set up · no ${holds.missing}`, notSetUp: true };
	return { text: `No ${holds.missing}`, notSetUp: false };
}

/** States the unit-wide cutoff the dashboard applies. */
export function strengthFloorSentence(floorPercent: number, activePersonnel: number): string {
	const flagged = highestFlaggedAvailable(activePersonnel, floorPercent);
	if (flagged === null) return 'No one is on the roster yet, so nothing is flagged.';
	const exact = ((floorPercent * activePersonnel) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
	const lead = `${floorPercent}% of ${activePersonnel.toLocaleString('en-US')} is ${exact}`;
	if (flagged === 0) return `${lead}, so the unit is flagged only when no one is available.`;
	return `${lead}, so ${flagged.toLocaleString('en-US')} or fewer available is flagged.`;
}
