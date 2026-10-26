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
