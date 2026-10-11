export type ReadinessBandTier = 'danger' | 'warn' | 'caution' | 'okay' | 'good' | 'not-applicable';

/** `ramp` is the stepped Critical Tasks scale; `semantic` reads success → warning → destructive from theme tokens. */
export type ReadinessBandPalette = 'ramp' | 'semantic';

type TierClasses = Record<ReadinessBandTier, string>;

export const readinessBandCellPalette: Record<ReadinessBandPalette, { base: string; tiers: TierClasses }> = {
	ramp: {
		base: 'border-foreground/16 font-semibold',
		tiers: {
			danger: 'bg-readiness-band-danger text-readiness-band-ink',
			warn: 'bg-readiness-band-warn text-readiness-band-ink',
			caution: 'bg-readiness-band-caution text-readiness-band-ink',
			okay: 'bg-readiness-band-okay text-readiness-band-ink',
			good: 'bg-readiness-band-good text-readiness-band-ink',
			'not-applicable': 'readiness-band-stripes text-muted-foreground'
		}
	},
	semantic: {
		base: 'border-transparent font-medium text-foreground',
		tiers: {
			danger: 'bg-destructive font-semibold text-background',
			warn: 'bg-destructive/18',
			caution: 'bg-warning/28',
			okay: 'bg-warning/12',
			good: 'bg-success/14',
			'not-applicable': 'text-muted-foreground inset-ring inset-ring-border'
		}
	}
};

export const readinessBandSwatchFill: Record<ReadinessBandPalette, TierClasses> = {
	ramp: {
		danger: 'bg-readiness-band-danger',
		warn: 'bg-readiness-band-warn',
		caution: 'bg-readiness-band-caution',
		okay: 'bg-readiness-band-okay',
		good: 'bg-readiness-band-good',
		'not-applicable': 'readiness-band-stripes'
	},
	semantic: {
		danger: 'bg-destructive',
		warn: 'bg-destructive/18',
		caution: 'bg-warning/28',
		okay: 'bg-warning/12',
		good: 'bg-success/14',
		'not-applicable': ''
	}
};

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
