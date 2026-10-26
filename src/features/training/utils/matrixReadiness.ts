import type { ReadinessBandTier } from '$lib/components/patterns/readiness-band/index.js';
import type { BriefingBand } from './trainingBriefing.types';

export const BRIEFING_BAND_TIER: Record<BriefingBand, ReadinessBandTier> = {
	goal: 'good',
	near: 'okay',
	below: 'caution',
	far: 'warn',
	critical: 'danger',
	none: 'not-applicable'
};

/** How far ahead the matrix looks for requirements that are about to lapse. */
export const MATRIX_HORIZON_DAYS = 30;
