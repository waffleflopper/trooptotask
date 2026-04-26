import { describe, expect, it } from 'vitest';
import { computeProgressiveVisibleCount } from './ProgressiveToolbarActions.types';

describe('computeProgressiveVisibleCount', () => {
	it('collapses lower-priority leading actions before higher-priority trailing actions', () => {
		const itemWidths = [80, 120, 100, 70, 130];

		expect(
			computeProgressiveVisibleCount({
				containerWidth: 348,
				itemWidths,
				overflowWidth: 70,
				gapWidth: 8
			})
		).toBe(2);
	});

	it('keeps every action visible when the full action set fits', () => {
		const itemWidths = [80, 120, 100, 70, 130];

		expect(
			computeProgressiveVisibleCount({
				containerWidth: 540,
				itemWidths,
				overflowWidth: 70,
				gapWidth: 8
			})
		).toBe(5);
	});
});
