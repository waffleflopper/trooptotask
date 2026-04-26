import { describe, expect, it } from 'vitest';
import { isToolbarLeadingContentCrowded } from './toolbarContentFit';

describe('isToolbarLeadingContentCrowded', () => {
	it('keeps leading controls expanded when measured content fits beside actions', () => {
		expect(
			isToolbarLeadingContentCrowded({
				containerWidth: 900,
				paddingInline: 24,
				gapWidth: 12,
				leadingWidth: 560,
				actionsWidth: 280,
				slotCount: 2
			})
		).toBe(false);
	});

	it('compacts leading controls when measured content would crowd actions', () => {
		expect(
			isToolbarLeadingContentCrowded({
				containerWidth: 900,
				paddingInline: 24,
				gapWidth: 12,
				leadingWidth: 680,
				actionsWidth: 280,
				slotCount: 2
			})
		).toBe(true);
	});

	it('responds to added filters or actions through measured width instead of a fixed breakpoint', () => {
		const baseToolbar = {
			containerWidth: 980,
			paddingInline: 24,
			gapWidth: 12,
			actionsWidth: 220,
			slotCount: 2
		};

		expect(isToolbarLeadingContentCrowded({ ...baseToolbar, leadingWidth: 720 })).toBe(false);
		expect(isToolbarLeadingContentCrowded({ ...baseToolbar, leadingWidth: 820 })).toBe(true);
	});
});
