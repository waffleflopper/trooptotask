import { FEATURE_SWITCHES, type FeatureKey } from '$lib/access/featureSwitches';
import type { ExportScopeCounts } from './exportsSettingsTypes';

/** The export area keys a turned-off feature removes from an export: its lane, or its key without one, kebab-cased. */
export function disabledExportAreaKeys(disabledFeatures: readonly FeatureKey[]): Set<string> {
	return new Set(
		disabledFeatures.map((key) =>
			(FEATURE_SWITCHES[key].lane ?? key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
		)
	);
}

const SCOPE_CHIPS = [
	{ area: 'calendar', label: () => 'Calendar' },
	{
		area: 'personnel',
		label: (counts: ExportScopeCounts | null) => (counts ? `Personnel · ${counts.activePersonnel}` : 'Personnel')
	},
	{
		area: 'training',
		label: (counts: ExportScopeCounts | null) =>
			counts
				? `Training · ${counts.trainingRecords} ${counts.trainingRecords === 1 ? 'record' : 'records'}`
				: 'Training'
	},
	{ area: 'onboarding', label: () => 'Onboarding' },
	{ area: 'training', label: () => 'Sign-in rosters' }
];

/** What an export of the unit contains: the areas whose feature is on. */
export function exportScopeChips(counts: ExportScopeCounts | null, disabledFeatures: readonly FeatureKey[]): string[] {
	const omitted = disabledExportAreaKeys(disabledFeatures);
	return SCOPE_CHIPS.filter(({ area }) => !omitted.has(area)).map(({ label }) => label(counts));
}
