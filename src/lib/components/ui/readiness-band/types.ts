export type ReadinessBandTier = 'danger' | 'warn' | 'caution' | 'okay' | 'good' | 'not-applicable';

/** `ramp` is the stepped Critical Tasks scale; `semantic` reads success → warning → destructive from theme tokens. */
export type ReadinessBandPalette = 'ramp' | 'semantic';

/** Text tone for a readiness value outside a cell: success at goal, warning within 20 points, destructive below. */
export const readinessBandTone: Record<ReadinessBandTier, string> = {
	good: 'text-success-foreground',
	okay: 'text-warning-foreground',
	caution: 'text-warning-foreground',
	warn: 'text-danger-foreground',
	danger: 'text-danger-foreground',
	'not-applicable': 'text-muted-foreground'
};

export interface ReadinessBandLegendItem {
	tier: ReadinessBandTier;
	label: string;
}

export const readinessBandLegendItems: ReadinessBandLegendItem[] = [
	{ tier: 'danger', label: '<60%' },
	{ tier: 'warn', label: '60-69%' },
	{ tier: 'caution', label: '70-79%' },
	{ tier: 'okay', label: '80-89%' },
	{ tier: 'good', label: '90%+' },
	{ tier: 'not-applicable', label: 'Not applicable' }
];

export function formatReadinessBandPercent(percent: number | null): string {
	return percent === null ? '-' : `${percent}%`;
}

export function readinessBandTierForPercent(percent: number | null): ReadinessBandTier {
	if (percent === null) return 'not-applicable';
	if (percent < 60) return 'danger';
	if (percent < 70) return 'warn';
	if (percent < 80) return 'caution';
	if (percent < 90) return 'okay';
	return 'good';
}
